import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { hashInviteToken, newInviteToken, INVITE_TTL_HOURS } from "@/lib/invite-token";
import { hashPassword, isPasswordReused, pushPasswordHistory, validatePasswordPolicy } from "@/lib/password";
import { emailEnabled, getMailer } from "@/server/mail/mailer";
import { inviteEmail } from "@/server/mail/template";

/**
 * Invite / password-reset flow (docs/22 §4). Replaces "the admin copies a temp password
 * off a done-screen" with a link only the invitee can use.
 *
 * The security shape, stated once:
 *  - The raw token is returned to the CALLER and emailed. Only its SHA-256 reaches the
 *    database, so `invite_token` rows are useless to anyone who reads them.
 *  - `consumeInviteToken` has no session to scope by — that is the point of an invite —
 *    so it finds the token's tenant by trying each tenant's RLS context in turn, the same
 *    pattern the GitHub webhook uses (`resolveGithubIntegration`). docs/22 §4.2 proposed
 *    an RLS-EXEMPT direct read instead, modelled on `access_request`; that does not work
 *    here and must not be made to. `access_request` is exempt because it has no
 *    `tenant_id` at all, whereas `invite_token` is a tenant table under FORCE RLS — a
 *    direct read outside `withTenant` matches zero rows (the DM1.18 trap), and the only
 *    way to "fix" it would be to weaken isolation on a table holding credentials-grade
 *    capabilities. Looping tenants costs one indexed lookup each and keeps rule 1 intact.
 *  - Failures are deliberately indistinguishable (missing / expired / consumed all read
 *    the same to the caller) so the endpoint can't be used to probe which tokens exist.
 */

export class InviteError extends Error {
  constructor(
    message: string,
    public code: "INVALID_TOKEN" | "WEAK_PASSWORD" | "REUSED" | "NOT_FOUND" | "BAD_STATE",
  ) {
    super(message);
    this.name = "InviteError";
  }
}

export type InvitePurpose = "invite" | "reset";

export interface MintResult {
  /** The one-time link. Returned so a mailer-less deployment can copy it (docs/22 §4.1). */
  acceptUrl: string;
  /** True when the email actually went out; false means "show the admin the link". */
  emailed: boolean;
}

/** Public base URL for links. Reuses AUTH_URL (already required on the box) — CLAUDE.md. */
function appUrl(): string {
  return (process.env.AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Mint a token for `userId` and email the link. Any previously unconsumed token for that
 * user+purpose is retired first: a resend must invalidate what it replaces, or the old
 * link keeps working and "resend" would widen the attack surface instead of narrowing it.
 */
export async function mintInvite(
  ctx: TenantContext,
  userId: string,
  purpose: InvitePurpose = "invite",
): Promise<MintResult> {
  const token = newInviteToken();

  const target = await withTenant(ctx, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!user) throw new InviteError("User not found.", "NOT_FOUND");
    if (user.status === "DELETED") throw new InviteError("That account has been deleted.", "BAD_STATE");

    await tx.inviteToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.inviteToken.create({
      data: {
        tenantId: ctx.tenantId,
        userId,
        tokenHash: token.hash,
        purpose,
        expiresAt: token.expiresAt,
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "user",
      entityId: userId,
      // The raw token never enters the audit trail — only the fact that one was issued.
      after: { [purpose === "reset" ? "password_reset_sent" : "invite_sent"]: true, expiresAt: token.expiresAt },
    });
    return user;
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { name: true, brandColor: true },
  });

  const acceptUrl = `${appUrl()}/onboarding/accept?token=${encodeURIComponent(token.raw)}`;
  let emailed = false;
  if (emailEnabled()) {
    const message = inviteEmail({
      name: target.name,
      tenantName: tenant?.name ?? "QUBIT",
      brandColor: tenant?.brandColor ?? "#231F20",
      acceptUrl,
      ttlHours: INVITE_TTL_HOURS,
      purpose,
    });
    const result = await getMailer().send({ to: target.email, ...message });
    emailed = result.ok;
  }
  return { acceptUrl, emailed };
}

/** Resend an invite — a fresh token; the previous one stops working (see mintInvite). */
export async function resendInvite(ctx: TenantContext, userId: string): Promise<MintResult> {
  return mintInvite(ctx, userId, "invite");
}

/** Admin-initiated password reset for an existing account. Same token mechanism. */
export async function startPasswordReset(ctx: TenantContext, userId: string): Promise<MintResult> {
  return mintInvite(ctx, userId, "reset");
}

export interface ConsumeResult {
  tenantSlug: string;
  email: string;
}

/**
 * The UNAUTHENTICATED accept path: exchange a raw token for a set password.
 *
 * Locates the token by probing each tenant's RLS context (see the file header), then does
 * every write inside `withTenant` scoped to the tenant the ROW names — the caller never
 * supplies a tenant, so cross-tenant use is not expressible.
 */
export async function consumeInviteToken(rawToken: string, newPassword: string): Promise<ConsumeResult> {
  const generic = "This link is invalid or has expired.";
  if (!rawToken) throw new InviteError(generic, "INVALID_TOKEN");

  const tokenHash = hashInviteToken(rawToken);
  const tenants = await prisma.tenant.findMany({ select: { id: true }, orderBy: { slug: "asc" } });
  let row: { id: string; tenantId: string; userId: string; expiresAt: Date; consumedAt: Date | null; purpose: string } | null =
    null;
  for (const tenant of tenants) {
    row = await withTenant({ tenantId: tenant.id, userId: "invite-accept" }, (tx) =>
      tx.inviteToken.findUnique({
        where: { tokenHash },
        select: { id: true, tenantId: true, userId: true, expiresAt: true, consumedAt: true, purpose: true },
      }),
    );
    if (row) break;
  }
  // One message for every failure mode: a caller must not learn whether a token exists.
  if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) {
    throw new InviteError(generic, "INVALID_TOKEN");
  }

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) throw new InviteError(policyError, "WEAK_PASSWORD");

  const ctx: TenantContext = { tenantId: row.tenantId, userId: row.userId, roles: [] };

  return withTenant(ctx, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: row.userId },
      select: { id: true, email: true, status: true, passwordHash: true, previousPasswordHashes: true },
    });
    if (!user || user.status === "DELETED") throw new InviteError(generic, "INVALID_TOKEN");

    const history = user.passwordHash
      ? [user.passwordHash, ...user.previousPasswordHashes]
      : user.previousPasswordHashes;
    if (await isPasswordReused(newPassword, history)) {
      throw new InviteError("Choose a password you haven’t used recently.", "REUSED");
    }

    // Claim the token in the same transaction as the password write: a concurrent second
    // use finds consumedAt already set and fails the guard above.
    const claimed = await tx.inviteToken.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) throw new InviteError(generic, "INVALID_TOKEN");

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        previousPasswordHashes: user.passwordHash
          ? pushPasswordHistory(user.previousPasswordHashes, user.passwordHash)
          : user.previousPasswordHashes,
        // A suspended user accepting a reset link stays suspended — the link sets a
        // password, it does not reinstate access.
        status: user.status === "INVITED" ? "ACTIVE" : user.status,
        // M-O3 lands the user straight in; M-O4 moves this to the end of the guided flow.
        mustChangePassword: false,
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "user",
      entityId: user.id,
      after: { [row.purpose === "reset" ? "password_reset_completed" : "invite_accepted"]: true },
    });

    const tenant = await prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { slug: true } });
    return { tenantSlug: tenant?.slug ?? "", email: user.email };
  });
}

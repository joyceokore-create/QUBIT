import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";
import { ssoEnabled } from "@/lib/sso";

/**
 * UX fidelity Tier 1 — Admin Home › Accounts Needing Attention › "Send Reminder" (design:
 * "Send a reminder to all of them at once"). Reminds every ACTIVE user in the caller's tenant
 * who has no authenticator set up, with an in-app notification linking to the MFA setup page
 * (through the domain-event outbox, so digests can email it).
 *
 * Guard rails (plan R7): at most one reminder per person per 24 hours (people reminded in
 * that window are skipped and counted); ONE audit row per batch with user ids only; refused
 * under SSO, where MFA lives at the identity provider. Permission (iam:manage) is checked by
 * the route.
 */
export const MFA_REMINDER_KIND = "mfa_reminder";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export class MfaReminderError extends Error {
  constructor(
    public code: "SSO",
    message: string,
  ) {
    super(message);
  }
}

export async function sendMfaReminders(ctx: TenantContext, now = new Date()): Promise<{ sent: number; skipped: number }> {
  if (ssoEnabled()) throw new MfaReminderError("SSO", "Microsoft sign-in handles MFA, so QUBIT can't remind people about it.");
  return withTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({ where: { status: "ACTIVE", mfaSecret: null }, select: { id: true } });
    if (users.length === 0) return { sent: 0, skipped: 0 };
    const recent = await tx.notification.findMany({
      where: { kind: MFA_REMINDER_KIND, userId: { in: users.map((u) => u.id) }, createdAt: { gte: new Date(now.getTime() - WINDOW_MS) } },
      select: { userId: true },
    });
    const skip = new Set(recent.map((r) => r.userId));
    const due = users.filter((u) => !skip.has(u.id) && u.id !== ctx.userId);
    if (due.length > 0) {
      await emitDomainEvent(tx, ctx, {
        type: "mfa.reminder_sent",
        entityType: "tenant",
        entityId: ctx.tenantId,
        payload: { count: due.length },
        notify: due.map((u) => ({
          userId: u.id,
          kind: MFA_REMINDER_KIND,
          message: "Set up two-factor authentication to keep your QUBIT account secure. It takes about a minute.",
          link: "/settings/mfa",
        })),
      });
      await audit(tx, ctx, { action: "mfa_reminder", entityType: "tenant", entityId: ctx.tenantId, after: { reminded: due.length, userIds: due.map((u) => u.id) } });
    }
    return { sent: due.length, skipped: users.length - due.length };
  });
}

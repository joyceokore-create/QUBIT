import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { withTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { decryptMfaSecret, verifyTotp } from "@/lib/mfa";
import { emitDomainEvent } from "@/server/events";
import { validationError } from "@/server/errors";
import { mfaResetCode } from "@/lib/user-edit-schema";

/**
 * POST /api/auth/mfa/reset — clear a user's second factor so they can re-enrol
 * (docs/23 §3). Closes the "lost authenticator = locked out forever" gap that recovery
 * codes alone don't cover (a user can lose the phone AND the codes).
 *
 * Gated on users:reset — the same bar as issuing a password-reset link, and for the same
 * reason: both are account-recovery powers that amount to takeover if misused. Audited
 * with the actor, because "who removed whose second factor" is exactly the question an
 * incident review asks.
 *
 * UX fidelity Tier 2 (plan R7) hardening, for the Users › Edit drawer's "Reset MFA":
 *  - step-up: an actor who has MFA must enter their OWN current authenticator code;
 *  - no self-reset (use your recovery codes, or ask another admin);
 *  - the person is notified in-app that their second factor was reset.
 */
const Body = z.object({ userId: z.string().min(1), code: mfaResetCode.optional() });

export async function POST(req: Request) {
  const guard = await requirePermission("users:reset");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.userId === guard.ctx.userId) {
    return NextResponse.json({ error: { code: "SELF_RESET", message: "You can't reset your own MFA. Use a recovery code, or ask another administrator." } }, { status: 409 });
  }

  const result = await withTenant(guard.ctx, async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: guard.ctx.userId }, select: { mfaSecret: true } });
    if (actor?.mfaSecret) {
      const ok = parsed.data.code ? await verifyTotp(decryptMfaSecret(actor.mfaSecret), parsed.data.code) : false;
      if (!ok) return "STEP_UP" as const;
    }
    const user = await tx.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
    if (!user) return "NOT_FOUND" as const;
    await tx.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, pendingMfaSecret: null, mfaRecoveryCodes: [] },
    });
    await audit(tx, guard.ctx, {
      action: "update",
      entityType: "user",
      entityId: user.id,
      after: { mfa_reset: true },
    });
    await emitDomainEvent(tx, guard.ctx, {
      type: "user.mfa_reset",
      entityType: "user",
      entityId: user.id,
      notify: [
        {
          userId: user.id,
          kind: "mfa_reset",
          message: "An administrator reset your two-factor authentication. You'll set up an authenticator again at your next sign-in.",
          link: "/settings/mfa",
        },
      ],
    });
    return "OK" as const;
  });

  if (result === "STEP_UP") {
    return NextResponse.json({ error: { code: "STEP_UP", message: "Enter the current code from your own authenticator app to confirm.", fields: { code: "Enter the current code from your own authenticator app to confirm." } } }, { status: 403 });
  }
  if (result === "NOT_FOUND") {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { withTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * POST /api/auth/mfa/reset — clear a user's second factor so they can re-enrol
 * (docs/23 §3). Closes the "lost authenticator = locked out forever" gap that recovery
 * codes alone don't cover (a user can lose the phone AND the codes).
 *
 * Gated on users:reset — the same bar as issuing a password-reset link, and for the same
 * reason: both are account-recovery powers that amount to takeover if misused. Audited
 * with the actor, because "who removed whose second factor" is exactly the question an
 * incident review asks.
 */
const Body = z.object({ userId: z.string().min(1) });

export async function POST(req: Request) {
  const guard = await requirePermission("users:reset");
  if ("response" in guard) return guard.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "userId is required." } }, { status: 400 });
  }

  const done = await withTenant(guard.ctx, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
    if (!user) return false;
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
    return true;
  });

  if (!done) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

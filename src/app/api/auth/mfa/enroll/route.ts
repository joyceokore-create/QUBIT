import { NextResponse } from "next/server";
import { getTenantContext, withTenant } from "@/lib/tenant";
import { encryptMfaSecret, generateMfaEnrollment } from "@/lib/mfa";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * POST /api/auth/mfa/enroll — start TOTP enrolment (docs/23 §3, audit finding A5).
 *
 * The secret is SERVER-BOUND: stored encrypted in `pendingMfaSecret`, with only the QR
 * image returned. Previously the raw secret went to the client and was handed back at
 * verify time, so the server persisted whatever the caller claimed — enrolment was
 * effectively client-controlled. Now /verify reads the pending value from the database.
 */
export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } }, { status: 401 });
  }

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { name: true } }),
    withTenant(ctx, (tx) => tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { email: true } })),
  ]);

  const { secret, qrDataUrl } = await generateMfaEnrollment(user.email, `QUBIT (${tenant.name})`);

  await withTenant(ctx, async (tx) => {
    // Starting again replaces any half-finished enrolment — the newest QR is the only one
    // that can be confirmed.
    await tx.user.update({ where: { id: ctx.userId }, data: { pendingMfaSecret: encryptMfaSecret(secret) } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "user",
      entityId: ctx.userId,
      after: { mfa_enroll_start: true },
    });
  });

  // Deliberately NOT returning `secret`. Authenticator apps read it from the QR; a user
  // who cannot scan re-runs enrolment on a device that can.
  return NextResponse.json({ qrDataUrl });
}

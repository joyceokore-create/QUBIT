import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext, withTenant } from "@/lib/tenant";
import { decryptMfaSecret, verifyTotp } from "@/lib/mfa";
import { generateRecoveryCodes } from "@/lib/mfa-recovery";
import { audit } from "@/lib/audit";

/**
 * POST /api/auth/mfa/verify — confirm a TOTP code and complete enrolment (docs/23 §3).
 *
 * Body is `{ token }` ONLY. A `secret` in the payload is ignored by construction: the
 * secret comes from `pendingMfaSecret`, which only /enroll can write. That is the A5 fix —
 * this route previously persisted whatever secret the client sent.
 *
 * On success the pending secret graduates to `mfaSecret`, the pending slot is cleared, and
 * recovery codes are generated: hashes stored, plaintext returned exactly once.
 */
const VerifySchema = z.object({ token: z.string().length(6) });

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sign in required." } }, { status: 401 });
  }

  const parsed = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Enter the 6-digit code." } }, { status: 400 });
  }

  const pending = await withTenant(ctx, (tx) =>
    tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { pendingMfaSecret: true } }),
  );
  if (!pending.pendingMfaSecret) {
    return NextResponse.json(
      { error: { code: "NO_PENDING", message: "Start enrolment again — no pending setup was found." } },
      { status: 400 },
    );
  }

  const secret = decryptMfaSecret(pending.pendingMfaSecret);
  if (!(await verifyTotp(secret, parsed.data.token))) {
    // The pending secret survives a wrong code: the user re-reads their app and retries
    // without rescanning.
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "Incorrect authentication code." } },
      { status: 400 },
    );
  }

  const codes = generateRecoveryCodes();
  await withTenant(ctx, async (tx) => {
    await tx.user.update({
      where: { id: ctx.userId },
      data: {
        // Already encrypted — re-storing the same ciphertext, not re-encrypting plaintext.
        mfaSecret: pending.pendingMfaSecret,
        pendingMfaSecret: null,
        mfaRecoveryCodes: codes.hashes,
      },
    });
    await audit(tx, ctx, { action: "mfa_enroll", entityType: "user", entityId: ctx.userId });
  });

  // The one and only time the plaintext codes leave the server.
  return NextResponse.json({ ok: true, recoveryCodes: codes.plain });
}

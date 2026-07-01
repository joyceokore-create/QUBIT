import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext, withTenant } from "@/lib/tenant";
import { verifyTotp, encryptMfaSecret } from "@/lib/mfa";
import { audit } from "@/lib/audit";

const VerifySchema = z.object({
  secret: z.string().min(1),
  token: z.string().length(6),
});

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const parsed = VerifySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid request." } },
      { status: 400 },
    );
  }
  const { secret, token } = parsed.data;

  if (!(await verifyTotp(secret, token))) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE", message: "Incorrect authentication code." } },
      { status: 400 },
    );
  }

  await withTenant(ctx, async (tx) => {
    await tx.user.update({
      where: { id: ctx.userId },
      data: { mfaSecret: encryptMfaSecret(secret) },
    });
    await audit(tx, ctx, { action: "mfa_enroll", entityType: "user", entityId: ctx.userId });
  });

  return NextResponse.json({ ok: true });
}

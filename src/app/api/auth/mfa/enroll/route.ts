import { NextResponse } from "next/server";
import { getTenantContext, withTenant } from "@/lib/tenant";
import { generateMfaEnrollment } from "@/lib/mfa";
import { prisma } from "@/lib/db";

export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const [tenant, user] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } }),
    withTenant(ctx, (tx) => tx.user.findUniqueOrThrow({ where: { id: ctx.userId } })),
  ]);

  const enrollment = await generateMfaEnrollment(user.email, `QUBIT (${tenant.name})`);
  return NextResponse.json(enrollment);
}

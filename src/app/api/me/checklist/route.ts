import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";

// POST /api/me/checklist — dismiss the first-login checklist (docs/23 §7). The column
// (not localStorage) is the record, so the dismissal holds across devices.

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles };
  const dismissedAt = new Date();
  await withTenant(ctx, async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: ctx.userId, checklistDismissedAt: null },
      data: { checklistDismissedAt: dismissedAt },
    });
    if (count > 0) {
      await audit(tx, ctx, { action: "update", entityType: "user", entityId: ctx.userId, after: { checklistDismissedAt: dismissedAt } });
    }
  });
  return NextResponse.json({ ok: true });
}

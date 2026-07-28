import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { isUserGroup, USER_GROUPS } from "@/lib/personas";

// POST /api/me/persona — persist the dashboard persona switcher choice (docs/17 §1.2:
// last-used wins next login). UI preference only; permissions are untouched.

const Body = z.object({ persona: z.enum(USER_GROUPS) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Unknown persona." } }, { status: 400 });
  }
  const { persona } = parsed.data;
  // Only personas the user actually holds — the switcher is a lens, not a costume box.
  if (!isUserGroup(persona) || !session.user.personas.includes(persona)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Not one of your personas." } }, { status: 403 });
  }
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles };
  await withTenant(ctx, async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { lastPersona: persona } });
    await audit(tx, ctx, { action: "update", entityType: "user", entityId: ctx.userId, after: { lastPersona: persona } });
  });
  return NextResponse.json({ ok: true });
}

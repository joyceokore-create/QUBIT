import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { getTenantContext } from "@/lib/tenant";
import { MarketCheckInInput, saveMarketCheckIn } from "@/server/rollout";

// PUT /api/projects/:id/markets/:orgUnitId/checkin — this week's market check-in
// (docs/18 §3.1). Same governance gate as the project's other status facts (§7): the
// project's PM/lead, or a holder of project:stage.

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; orgUnitId: string }> },
) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id, orgUnitId } = await params;

  const parsed = MarketCheckInInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  const allowed = can(ctx, "project:stage") || (await canWriteProject(ctx, id));
  if (!allowed) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  try {
    await saveMarketCheckIn(ctx, id, orgUnitId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: e instanceof Error ? e.message : "Could not save." } },
      { status: 404 },
    );
  }
}

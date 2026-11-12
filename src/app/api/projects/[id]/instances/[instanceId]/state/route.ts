import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { requirePermission } from "@/lib/api-guard";
import { ProjectInstanceError, SetInstanceStateInput, setInstanceState } from "@/server/project-instances";

// docs/38 — PUT { orgUnitId | null, state, note? }: the state of one instance in one market
// (null = product level). Same governance gate as gate states.
const STATUS: Record<ProjectInstanceError["code"], number> = { NOT_FOUND: 404, CODE_TAKEN: 409, HAS_WORK: 409, BAD_MARKET: 400 };

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; instanceId: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id, instanceId } = await params;
  if (!(can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the project's PM can set instance states." } }, { status: 403 });
  }
  const parsed = SetInstanceStateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await setInstanceState(guard.ctx, id, instanceId, parsed.data) });
  } catch (e) {
    if (e instanceof ProjectInstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

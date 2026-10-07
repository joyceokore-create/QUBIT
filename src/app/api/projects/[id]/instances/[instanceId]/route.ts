import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { requirePermission } from "@/lib/api-guard";
import { ProjectInstanceError, UpdateInstanceInput, removeProjectInstance, updateProjectInstance } from "@/server/project-instances";

// docs/38 — PATCH { name?, orderIndex? } / DELETE (only when it carries no work) one named instance.
const STATUS: Record<ProjectInstanceError["code"], number> = { NOT_FOUND: 404, CODE_TAKEN: 409, HAS_WORK: 409, BAD_MARKET: 400 };
type Ctx = { params: Promise<{ id: string; instanceId: string }> };

async function gate(id: string) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard;
  if (!(can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)))) {
    return { response: NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the project's PM can change its instances." } }, { status: 403 }) };
  }
  return guard;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, instanceId } = await params;
  const guard = await gate(id);
  if ("response" in guard) return guard.response;
  const parsed = UpdateInstanceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await updateProjectInstance(guard.ctx, id, instanceId, parsed.data) });
  } catch (e) {
    if (e instanceof ProjectInstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, instanceId } = await params;
  const guard = await gate(id);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await removeProjectInstance(guard.ctx, id, instanceId) });
  } catch (e) {
    if (e instanceof ProjectInstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

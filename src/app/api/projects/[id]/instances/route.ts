import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { requirePermission } from "@/lib/api-guard";
import { AddInstancesInput, InstanceError, addInstances, listAddableUnits, listInstances } from "@/server/instances";

// docs/38 — GET  /api/projects/:id/instances  → { data: { instances, addable, canManage } }
//           POST /api/projects/:id/instances  { orgUnitIds } → add (or revive) instances
// Managing instances is a governance act: the project's PM/lead, or project:stage.

const STATUS: Record<InstanceError["code"], number> = { NOT_FOUND: 404, BAD_UNIT: 400, ALREADY_ON: 409, HAS_WORK: 409, LEAD_NOT_FOUND: 400 };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  try {
    const canManage = can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id));
    const [instances, addable] = await Promise.all([listInstances(guard.ctx, id), canManage ? listAddableUnits(guard.ctx, id) : Promise.resolve([])]);
    return NextResponse.json({ data: { instances, addable, canManage } });
  } catch (e) {
    if (e instanceof InstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the project's PM can change its instances." } }, { status: 403 });
  }
  const parsed = AddInstancesInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick at least one org unit." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await addInstances(guard.ctx, id, parsed.data) }, { status: 201 });
  } catch (e) {
    if (e instanceof InstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

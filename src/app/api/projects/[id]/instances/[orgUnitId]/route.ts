import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { requirePermission } from "@/lib/api-guard";
import { InstanceError, UpdateInstanceInput, getInstanceSetup, retireInstance, updateInstance } from "@/server/instances";

// docs/38 — one instance of a project:
//   GET    → { data: { setup } }      the per-instance set-up signals
//   PATCH  { leadUserId?, note?, status? } → the instance list
//   DELETE → retire it (kept for history; refused while it carries open work)

const STATUS: Record<InstanceError["code"], number> = { NOT_FOUND: 404, BAD_UNIT: 400, ALREADY_ON: 409, HAS_WORK: 409, LEAD_NOT_FOUND: 400 };
type Ctx = { params: Promise<{ id: string; orgUnitId: string }> };

async function gate(id: string) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard;
  const allowed = can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id));
  if (!allowed) return { response: NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the project's PM can change its instances." } }, { status: 403 }) };
  return guard;
}

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id, orgUnitId } = await params;
  return NextResponse.json({ data: { setup: await getInstanceSetup(guard.ctx, id, orgUnitId) } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, orgUnitId } = await params;
  const guard = await gate(id);
  if ("response" in guard) return guard.response;
  const parsed = UpdateInstanceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await updateInstance(guard.ctx, id, orgUnitId, parsed.data) });
  } catch (e) {
    if (e instanceof InstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, orgUnitId } = await params;
  const guard = await gate(id);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await retireInstance(guard.ctx, id, orgUnitId) });
  } catch (e) {
    if (e instanceof InstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

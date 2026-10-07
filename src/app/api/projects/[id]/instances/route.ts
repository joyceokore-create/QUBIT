import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { requirePermission } from "@/lib/api-guard";
import { CreateInstanceInput, ProjectInstanceError, createProjectInstance, listProjectInstances } from "@/server/project-instances";

// docs/38 — a product's named instances (Schools, Marketplace …) and modules (USSD, POS …):
//   GET  ?kind=instance|module → { data: { instances, canManage } }  state + gate-derived % per market
//   POST { name, code?, kind?, parentId?, ownGates? } → create one (the PM or project:stage)

const STATUS: Record<ProjectInstanceError["code"], number> = { NOT_FOUND: 404, CODE_TAKEN: 409, HAS_WORK: 409, BAD_MARKET: 400 };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") === "module" ? "module" : "instance";
  const canManage = can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id));
  return NextResponse.json({ data: { instances: await listProjectInstances(guard.ctx, id, kind), canManage } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)))) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Only the project's PM can add instances." } }, { status: 403 });
  }
  const parsed = CreateInstanceInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Give the instance a name." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await createProjectInstance(guard.ctx, id, parsed.data) }, { status: 201 });
  } catch (e) {
    if (e instanceof ProjectInstanceError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    throw e;
  }
}

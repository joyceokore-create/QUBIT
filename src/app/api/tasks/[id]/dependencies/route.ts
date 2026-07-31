import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteTask } from "@/lib/access";
import { DependencyError, DependencyInput, addDependency, listWaitingOn, removeDependency } from "@/server/dependencies";

// GET    /api/tasks/:id/dependencies — what this task is waiting on
// POST   /api/tasks/:id/dependencies { dependsOnTaskId } — declare a wait
// DELETE /api/tasks/:id/dependencies?dependsOnTaskId= — drop one
//
// Same write gate as the task itself. A refused CYCLE answers 409: the request is
// well-formed, the graph simply cannot accept it.

const STATUS: Record<DependencyError["code"], number> = { NOT_FOUND: 404, BAD_INPUT: 400, CYCLE: 409 };

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  return NextResponse.json({ data: await listWaitingOn(guard.ctx, id) });
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteTask(guard.ctx, id))) {
    return forbidden("You can only change tasks on a project you're part of.");
  }
  const parsed = DependencyInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await addDependency(guard.ctx, id, parsed.data.dependsOnTaskId) });
  } catch (e) {
    if (e instanceof DependencyError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteTask(guard.ctx, id))) {
    return forbidden("You can only change tasks on a project you're part of.");
  }
  const dependsOnTaskId = new URL(req.url).searchParams.get("dependsOnTaskId");
  if (!dependsOnTaskId) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "dependsOnTaskId is required." } }, { status: 400 });
  }
  return NextResponse.json({ data: await removeDependency(guard.ctx, id, dependsOnTaskId) });
}

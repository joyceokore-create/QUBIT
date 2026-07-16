import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { updateTask, removeTask, UpdateTaskInput, TaskError } from "@/server/project-tasks";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = UpdateTaskInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid update." } }, { status: 400 });
  }
  const { id } = await params;
  try {
    await updateTask(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  await removeTask(guard.ctx, id);
  return NextResponse.json({ ok: true });
}

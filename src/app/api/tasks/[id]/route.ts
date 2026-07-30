import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteTask, canPublishTask } from "@/lib/access";
import { updateTask, removeTask, UpdateTaskInput, TaskError } from "@/server/project-tasks";
import { assignmentWarning } from "@/server/absence";
import { withTenant } from "@/lib/tenant";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteTask(guard.ctx, id))) {
    return forbidden("You can only update tasks assigned to you or on a project you're part of.");
  }
  const parsed = UpdateTaskInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid update." } }, { status: 400 });
  }
  // Draft↔Published is the plan-approval gate — PM-level, stricter than task-write (DM1.15 №3).
  if (parsed.data.approvalStatus !== undefined && !(await canPublishTask(guard.ctx, id))) {
    return forbidden("Only the project's manager (lead/PM) can publish or unpublish a task.");
  }
  try {
    await updateTask(guard.ctx, id, parsed.data);
    // docs/16 §5 — the update SUCCEEDS, then we tell the caller if the assignee is away
    // on the due date and who else could take it. A warning, never a block: the PM may
    // know something the leave calendar does not.
    const task = await withTenant(guard.ctx, (tx) =>
      tx.projectTask.findUnique({ where: { id }, select: { projectId: true, assigneeId: true, dueDate: true } }),
    );
    const warning = task
      ? await assignmentWarning(guard.ctx, task.projectId, task.assigneeId, task.dueDate)
      : null;
    return NextResponse.json({ ok: true, ...(warning?.conflict ? { warning } : {}) });
  } catch (e) {
    if (e instanceof TaskError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteTask(guard.ctx, id))) {
    return forbidden("You can only delete tasks on a project you're part of.");
  }
  await removeTask(guard.ctx, id);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { withTenant } from "@/lib/tenant";
import { nudgeTask, TaskError } from "@/server/project-tasks";

/**
 * Milestone A — POST nudges the assignee of a blocked task (email + bell). PM-level on
 * the task's project (canWriteProject — NOT canWriteTask, which would let the assignee
 * nudge themselves). No body: everything the nudge needs is on the task. With
 * FEATURE_EMAIL off the response carries `emailed: false` and only the bell fires.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  // RLS makes another tenant's task read as absent — 404, never a leak.
  const task = await withTenant(guard.ctx, (tx) => tx.projectTask.findUnique({ where: { id }, select: { projectId: true } }));
  if (!task) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Task not found." } }, { status: 404 });
  if (!(await canWriteProject(guard.ctx, task.projectId))) {
    return forbidden("Nudging is for the project's PM.");
  }
  try {
    const result = await nudgeTask(guard.ctx, id);
    return NextResponse.json(
      { data: { lastNudgedAt: result.lastNudgedAt, emailed: result.emailed, channel: result.channel } },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof TaskError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "ALREADY_NUDGED" ? 409 : e.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

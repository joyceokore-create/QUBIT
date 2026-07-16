import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { listActivity } from "@/server/activity";
import { getTask } from "@/server/tasks";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/{id}/activity — the task's activity feed (newest first).
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    await getTask(guard.ctx, id); // 404s if missing/cross-tenant before reading activity
    return ok(await listActivity(guard.ctx, "task", id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

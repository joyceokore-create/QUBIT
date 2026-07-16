import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createTask, listTasks } from "@/server/tasks";
import { createTask as createTaskSchema } from "@/server/schemas/tasks";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/lists/{id}/tasks — top-level tasks in the list (subtasks nest under parents).
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await listTasks(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// POST /api/v1/lists/{id}/tasks — create a task in the list.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:create");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = createTaskSchema.parse(await readJson(req));
    return ok(await createTask(guard.ctx, { listId: id, ...input }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

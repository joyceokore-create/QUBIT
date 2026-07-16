import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteTask, getTask, updateTask } from "@/server/tasks";
import { updateTask as updateTaskSchema } from "@/server/schemas/tasks";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/{id}
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await getTask(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// PATCH /api/v1/tasks/{id}
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateTaskSchema.parse(await readJson(req));
    return ok(await updateTask(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// DELETE /api/v1/tasks/{id} — soft delete.
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteTask(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

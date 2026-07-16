import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createSubtask } from "@/server/tasks";
import { createSubtask as createSubtaskSchema } from "@/server/schemas/tasks";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/tasks/{id}/subtasks — create a subtask under the task.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:create");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = createSubtaskSchema.parse(await readJson(req));
    return ok(await createSubtask(guard.ctx, id, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { moveTask } from "@/server/tasks";
import { moveTask as moveTaskSchema } from "@/server/schemas/tasks";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/tasks/{id}/move — move a task to another list.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { listId } = moveTaskSchema.parse(await readJson(req));
    return ok(await moveTask(guard.ctx, id, listId));
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { queryTasks } from "@/server/views/query";
import { taskQuery } from "@/server/schemas/views";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/lists/{id}/tasks/query — compiled task query (filters/sort/keyset page).
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const opts = taskQuery.parse(await readJson(req));
    const { tasks, nextCursor } = await queryTasks(guard.ctx, id, opts);
    return ok(tasks, { nextCursor });
  } catch (err) {
    return toErrorResponse(err);
  }
}

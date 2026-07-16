import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { addDependency } from "@/server/tasks";
import { addDependency as addDependencySchema } from "@/server/schemas/tasks";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/tasks/{id}/dependencies — {id} is the blocking task (from); body.toId is blocked.
// 422 on self-link or cycle, 409 on duplicate.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { toId, type } = addDependencySchema.parse(await readJson(req));
    return ok(await addDependency(guard.ctx, { fromId: id, toId, type }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

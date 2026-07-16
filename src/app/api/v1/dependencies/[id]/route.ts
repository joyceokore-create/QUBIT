import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { removeDependency } from "@/server/tasks";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/v1/dependencies/{id} — remove a dependency edge.
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await removeDependency(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

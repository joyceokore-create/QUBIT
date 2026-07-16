import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { setWatcher } from "@/server/tasks";

type Ctx = { params: Promise<{ id: string; userId: string }> };

// POST/DELETE /api/v1/tasks/{id}/watchers/{userId}
export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id, userId } = await params;
    return ok(await setWatcher(guard.ctx, id, userId, true));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id, userId } = await params;
    return ok(await setWatcher(guard.ctx, id, userId, false));
  } catch (err) {
    return toErrorResponse(err);
  }
}

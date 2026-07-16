import { requirePermission } from "@/lib/api-guard";
import { ok, toErrorResponse } from "@/server/errors";
import { setTag } from "@/server/tasks";

type Ctx = { params: Promise<{ id: string; tagId: string }> };

// POST/DELETE /api/v1/tasks/{id}/tags/{tagId}
export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id, tagId } = await params;
    return ok(await setTag(guard.ctx, id, tagId, true));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id, tagId } = await params;
    return ok(await setTag(guard.ctx, id, tagId, false));
  } catch (err) {
    return toErrorResponse(err);
  }
}

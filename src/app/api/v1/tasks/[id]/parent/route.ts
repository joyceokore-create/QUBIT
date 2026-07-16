import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { setParent } from "@/server/tasks";
import { setParent as setParentSchema } from "@/server/schemas/tasks";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/tasks/{id}/parent — promote (parentId=null) or demote under another task.
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { parentId } = setParentSchema.parse(await readJson(req));
    return ok(await setParent(guard.ctx, id, parentId));
  } catch (err) {
    return toErrorResponse(err);
  }
}

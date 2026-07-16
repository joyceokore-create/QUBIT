import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteChecklistItem, updateChecklistItem } from "@/server/checklists";
import { updateChecklistItem as updateItemSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/checklist-items/{id} — toggle done / rename / (re)assign.
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateItemSchema.parse(await readJson(req));
    return ok(await updateChecklistItem(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteChecklistItem(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

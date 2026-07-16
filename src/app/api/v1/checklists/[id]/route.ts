import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteChecklist, updateChecklist } from "@/server/checklists";
import { updateChecklist as updateChecklistSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { name } = updateChecklistSchema.parse(await readJson(req));
    return ok(await updateChecklist(guard.ctx, id, name));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteChecklist(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

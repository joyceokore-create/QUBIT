import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteView, updateView } from "@/server/views";
import { updateView as updateSchema } from "@/server/schemas/views";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateSchema.parse(await readJson(req));
    return ok(await updateView(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteView(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

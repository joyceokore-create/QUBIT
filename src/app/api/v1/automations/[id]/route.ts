import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteAutomation, updateAutomation } from "@/server/automations";
import { updateAutomation as updateSchema } from "@/server/schemas/automations";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateSchema.parse(await readJson(req));
    return ok(await updateAutomation(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteAutomation(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

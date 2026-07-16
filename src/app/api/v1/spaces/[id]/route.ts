import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { updateSpace } from "@/server/spaces";
import { updateSpace as updateSpaceSchema } from "@/server/schemas/hierarchy";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/spaces/{id} — update space fields (name/icon/color/private/settings/archive).
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateSpaceSchema.parse(await readJson(req));
    return ok(await updateSpace(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// DELETE /api/v1/spaces/{id} — archive (soft; hierarchy is never hard-deleted here).
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await updateSpace(guard.ctx, id, { archived: true }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

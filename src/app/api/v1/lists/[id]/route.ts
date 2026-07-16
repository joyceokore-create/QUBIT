import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { updateList } from "@/server/spaces";
import { updateList as updateListSchema } from "@/server/schemas/hierarchy";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/lists/{id} — rename / archive / retarget status group / info fields.
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateListSchema.parse(await readJson(req));
    return ok(await updateList(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// DELETE /api/v1/lists/{id} — archive.
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await updateList(guard.ctx, id, { archived: true }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

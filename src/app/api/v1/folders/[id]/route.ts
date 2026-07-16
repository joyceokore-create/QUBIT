import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { updateFolder } from "@/server/spaces";
import { updateFolder as updateFolderSchema } from "@/server/schemas/hierarchy";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/folders/{id} — rename / archive.
export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const patch = updateFolderSchema.parse(await readJson(req));
    return ok(await updateFolder(guard.ctx, id, patch));
  } catch (err) {
    return toErrorResponse(err);
  }
}

// DELETE /api/v1/folders/{id} — archive.
export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await updateFolder(guard.ctx, id, { archived: true }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

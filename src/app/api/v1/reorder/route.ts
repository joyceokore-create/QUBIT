import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { reorder } from "@/server/spaces";
import { reorder as reorderSchema } from "@/server/schemas/hierarchy";

// PATCH /api/v1/reorder — move a space/folder/list to sit after another sibling.
export async function PATCH(req: Request) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  try {
    const input = reorderSchema.parse(await readJson(req));
    return ok(await reorder(guard.ctx, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}

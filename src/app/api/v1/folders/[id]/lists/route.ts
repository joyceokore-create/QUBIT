import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { forTenant, assertFound } from "@/server/tenant-db";
import { createList } from "@/server/spaces";
import { createList as createListSchema } from "@/server/schemas/hierarchy";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/folders/{id}/lists — create a list inside the folder.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;
  try {
    const { id: folderId } = await params;
    const input = createListSchema.parse(await readJson(req));
    // Resolve the folder's space (RLS scopes it; 404 if cross-tenant/missing).
    const folder = await forTenant(guard.ctx, (tx) =>
      tx.folder.findUnique({ where: { id: folderId }, select: { spaceId: true } }),
    );
    const { spaceId } = assertFound(folder, "Folder not found.");
    return ok(await createList(guard.ctx, { ...input, spaceId, folderId }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

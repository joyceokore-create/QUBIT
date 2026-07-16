import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createFolder } from "@/server/spaces";
import { createFolder as createFolderSchema } from "@/server/schemas/hierarchy";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/spaces/{id}/folders — create a folder in the space.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = createFolderSchema.parse(await readJson(req));
    return ok(await createFolder(guard.ctx, { spaceId: id, ...input }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createList } from "@/server/spaces";
import { createList as createListSchema } from "@/server/schemas/hierarchy";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/spaces/{id}/lists — create a folderless list in the space.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:create");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = createListSchema.parse(await readJson(req));
    return ok(await createList(guard.ctx, { spaceId: id, ...input }));
  } catch (err) {
    return toErrorResponse(err);
  }
}

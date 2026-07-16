import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { addChecklistItem } from "@/server/checklists";
import { addChecklistItem as addItemSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/checklists/{id}/items
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = addItemSchema.parse(await readJson(req));
    return ok(await addChecklistItem(guard.ctx, id, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}

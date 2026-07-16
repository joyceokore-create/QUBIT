import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { createChecklist, listChecklists } from "@/server/checklists";
import { createChecklist as createChecklistSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

// GET/POST /api/v1/tasks/{id}/checklists
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await listChecklists(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { name } = createChecklistSchema.parse(await readJson(req));
    return ok(await createChecklist(guard.ctx, id, name));
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { setResolved } from "@/server/comments";
import { resolveComment as resolveSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/comments/{id}/resolve — resolve/reopen an assigned comment.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { resolved } = resolveSchema.parse(await readJson(req));
    return ok(await setResolved(guard.ctx, id, resolved));
  } catch (err) {
    return toErrorResponse(err);
  }
}

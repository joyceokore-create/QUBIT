import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { toggleReaction } from "@/server/comments";
import { reactComment as reactSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/v1/comments/{id}/reactions — toggle the caller's emoji reaction.
export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { emoji } = reactSchema.parse(await readJson(req));
    return ok(await toggleReaction(guard.ctx, id, emoji));
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { addComment, listComments } from "@/server/comments";
import { addComment as addCommentSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

// GET/POST /api/v1/tasks/{id}/comments
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await listComments(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const input = addCommentSchema.parse(await readJson(req));
    return ok(await addComment(guard.ctx, id, input));
  } catch (err) {
    return toErrorResponse(err);
  }
}

import { requirePermission } from "@/lib/api-guard";
import { ok, readJson, toErrorResponse } from "@/server/errors";
import { deleteComment, editComment } from "@/server/comments";
import { editComment as editCommentSchema } from "@/server/schemas/collab";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    const { content } = editCommentSchema.parse(await readJson(req));
    return ok(await editComment(guard.ctx, id, content));
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:update");
  if ("response" in guard) return guard.response;
  try {
    const { id } = await params;
    return ok(await deleteComment(guard.ctx, id));
  } catch (err) {
    return toErrorResponse(err);
  }
}

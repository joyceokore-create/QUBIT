import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ConversationError, deleteComment } from "@/server/conversation";

// DELETE /api/comments/[id] — author or the project's PMs (moderation).

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteComment(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ConversationError) {
      const status = err.code === "NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    throw err;
  }
}

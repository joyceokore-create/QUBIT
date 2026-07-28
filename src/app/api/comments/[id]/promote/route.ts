import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { ConversationError, promoteToDecision, PromoteInput } from "@/server/conversation";

// POST /api/comments/[id]/promote — one click turns a thread's outcome into a Decision
// log entry on the project (§4). PM-level (canWriteProject, enforced in the engine).

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const parsed = PromoteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "A decision needs a title." } },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    return NextResponse.json({ data: await promoteToDecision(ctx, id, parsed.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof ConversationError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 400;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    throw err;
  }
}

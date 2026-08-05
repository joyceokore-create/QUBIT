import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getIdeaBoard, IdeaError, SubmitIdeaInput, submitIdea } from "@/server/ideas";

// M-P4a (docs/35 §1) — intake is universal (`idea:create` sits in BASE), so the same
// permission reads the board; the engine narrows non-triagers to their OWN submissions.
export async function GET() {
  const guard = await requirePermission("idea:create");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await getIdeaBoard(guard.ctx) });
}

export async function POST(req: Request) {
  const guard = await requirePermission("idea:create");
  if ("response" in guard) return guard.response;
  const parsed = SubmitIdeaInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({ data: await submitIdea(guard.ctx, parsed.data) }, { status: 201 });
  } catch (e) {
    if (e instanceof IdeaError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

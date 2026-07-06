import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { updateIssue, UpdateIssueInput, IssueError } from "@/server/issues";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("issue:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateIssueInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  try {
    await updateIssue(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof IssueError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

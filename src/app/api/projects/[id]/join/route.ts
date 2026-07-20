import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { requestToJoin, RequestToJoinInput, JoinRequestError } from "@/server/join-requests";

// Request to join a project — available to every authenticated user (project:join:request).
// Creates a Pending request for the project's lead/PM to approve.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:join:request");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = RequestToJoinInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }

  try {
    const r = await requestToJoin(guard.ctx, id, parsed.data);
    return NextResponse.json(r, { status: r.alreadyPending ? 200 : 201 });
  } catch (e) {
    if (e instanceof JoinRequestError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    }
    throw e;
  }
}

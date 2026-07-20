import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { approveJoinRequest, JoinRequestError } from "@/server/join-requests";

// Approve a join request — enforced server-side to the request's project lead/PM (or a
// head/SuperAdmin). Creates the ProjectMember and marks the request Approved.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  try {
    await approveJoinRequest(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof JoinRequestError) {
      const status = e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

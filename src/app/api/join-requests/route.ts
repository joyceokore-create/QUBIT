import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { listPendingForApprover } from "@/server/join-requests";

// The viewer's approval queue — pending join requests they may decide (their projects', plus
// all pending for heads/SuperAdmin). Empty for a user who runs no projects.
export async function GET() {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ items: await listPendingForApprover(guard.ctx) });
}

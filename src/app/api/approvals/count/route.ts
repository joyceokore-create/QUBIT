import { NextResponse } from "next/server";
import { requireSession, forbidden } from "@/lib/api-guard";
import { canOpenApprovals, countApprovals } from "@/server/approvals";

// UX8 — the Approvals sidebar badge: ideas + staffing requests (+ WS1 gates) waiting for this person.
// Session + the page's own gate (idea:triage OR staffing:manage); each source is then
// counted only under the rule its action enforces (src/server/approvals.ts).
export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  if (!canOpenApprovals(guard.ctx)) return forbidden();
  const { total, ideas, staffing, gates } = await countApprovals(guard.ctx);
  return NextResponse.json({ waiting: total, ideas, staffing, gates });
}

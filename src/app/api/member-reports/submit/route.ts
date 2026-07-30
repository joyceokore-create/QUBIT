import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { submitMyReport, MemberReportError } from "@/server/member-reports";

// POST /api/member-reports/submit — send MY week to the lead(s) of every project in it
// (docs/18 §5.1.3). Submitting is always the member's own act: no id, no impersonation.

export async function POST() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ mine: await submitMyReport(guard.ctx) });
  } catch (e) {
    if (e instanceof MemberReportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 409 });
    }
    throw e;
  }
}

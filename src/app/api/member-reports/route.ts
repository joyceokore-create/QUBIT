import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import {
  getMyReport,
  saveMyReport,
  listTeamReports,
  MemberReportError,
  SaveMemberReportInput,
} from "@/server/member-reports";

// GET  /api/member-reports        — my week (persisted row or computed draft) + the
//                                   reports routed to me as a project lead (§5.1.3)
// PATCH /api/member-reports       — save MY edits (narrative, per-project notes/lines)
// The report is always the viewer's own: there is no id in the path, so one member can
// never address another's draft. Acknowledgement lives on [id]/acknowledge.

export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const [mine, team] = await Promise.all([getMyReport(guard.ctx), listTeamReports(guard.ctx)]);
  return NextResponse.json({ mine, team });
}

export async function PATCH(req: Request) {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  const parsed = SaveMemberReportInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ mine: await saveMyReport(guard.ctx, parsed.data) });
  } catch (e) {
    if (e instanceof MemberReportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 409 });
    }
    throw e;
  }
}

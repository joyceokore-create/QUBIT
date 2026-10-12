import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { getStatusWorkspace, UploadWeekError } from "@/server/status-report-upload";

// GET /api/reports/status-upload/workspace?week= — the weekly update workspace: every
// project the viewer runs with its gates, channel states per market, this week's line,
// status note and market check-ins, as QUBIT has them now. Read-only; /apply writes.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const week = new URL(req.url).searchParams.get("week");
  try {
    return NextResponse.json({ data: await getStatusWorkspace(guard.ctx, week) });
  } catch (e) {
    if (e instanceof UploadWeekError) return NextResponse.json({ error: { code: "BAD_WEEK", message: e.message } }, { status: 400 });
    throw e;
  }
}

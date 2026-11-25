import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { saveStageTerm, StageTermInput, UploadWeekError } from "@/server/status-report-upload";

// POST /api/reports/status-upload/stage-terms { term, gateName } — teach QUBIT what a
// phrase in a status line means ("build ongoing" → Prototype), tenant-wide; gateName null
// forgets it. Anyone who updates projects (PMs, Heads) may teach: the term only ever
// prefills a review the PM still ticks, and the audit row says who taught it. Members and
// read-only roles can't change the tenant's vocabulary.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = StageTermInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Check the phrase." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await saveStageTerm(guard.ctx, parsed.data) });
  } catch (e) {
    if (e instanceof UploadWeekError) return NextResponse.json({ error: { code: "VALIDATION", message: e.message } }, { status: 400 });
    throw e;
  }
}

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { saveStageTerm, StageTermInput, UploadWeekError } from "@/server/status-report-upload";

// POST /api/reports/status-upload/stage-terms { term, gateName } — teach QUBIT what a
// phrase in a status line means ("build ongoing" → Prototype), tenant-wide; gateName null
// forgets it. Any signed-in PM may teach: the term only ever prefills a review the PM
// still ticks, and the audit row says who taught it.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireSession();
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

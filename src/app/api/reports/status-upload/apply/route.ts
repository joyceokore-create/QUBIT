import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { ApplyInput, applyStatusReport, UploadWeekError } from "@/server/status-report-upload";

// POST /api/reports/status-upload/apply — fill the chosen projects' weekly drafts from the
// reviewed rows (narrative + RAG override + status note) and attach the file. Each row is
// a result; the PM then sends with the queue's own confirm & send.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = ApplyInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Check the rows." } }, { status: 400 });
  }
  try {
    return NextResponse.json({ data: await applyStatusReport(guard.ctx, parsed.data) });
  } catch (e) {
    if (e instanceof UploadWeekError) return NextResponse.json({ error: { code: "BAD_WEEK", message: e.message } }, { status: 400 });
    throw e;
  }
}

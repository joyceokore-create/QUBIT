import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { ApplyInput, applyStatusReport } from "@/server/status-report-upload";

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
  return NextResponse.json({ data: await applyStatusReport(guard.ctx, parsed.data) });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { dismissRoutedLine, UploadNotFoundError } from "@/server/status-report-upload";

// POST /api/reports/status-upload/routed/dismiss { rowId } — the PM who runs the project
// declines a line a colleague's report sent them (plan Phase 2). The uploader is told; the
// project is untouched. Anyone who can't write the project gets "not found".
export const dynamic = "force-dynamic";

const DismissInput = z.object({ rowId: z.string().uuid() });

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = DismissInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick the line to dismiss." } }, { status: 400 });
  try {
    await dismissRoutedLine(guard.ctx, parsed.data.rowId);
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    if (e instanceof UploadNotFoundError) return NextResponse.json({ error: { code: "NOT_FOUND", message: "That line isn't waiting for you." } }, { status: 404 });
    throw e;
  }
}

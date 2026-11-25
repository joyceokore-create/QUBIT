import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { routeUploadLines, UploadNotFoundError } from "@/server/status-report-upload";

// POST /api/reports/status-upload/send { uploadId, lines } — send the uploader's chosen lines
// to the PMs who run those projects (plan Phase 2). Writes nothing to the projects: each line
// waits on its PM's Weekly Update until they use or dismiss it. Only the uploader's own
// upload, and only lines matched exactly to a project somebody else runs, can be sent.
export const dynamic = "force-dynamic";

const SendInput = z.object({
  uploadId: z.string().uuid(),
  lines: z.array(z.number().int().min(0)).min(1).max(200),
});

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = SendInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick the lines to send." } }, { status: 400 });
  try {
    return NextResponse.json({ data: await routeUploadLines(guard.ctx, parsed.data.uploadId, parsed.data.lines) });
  } catch (e) {
    if (e instanceof UploadNotFoundError) return NextResponse.json({ error: { code: "NOT_FOUND", message: e.message } }, { status: 404 });
    throw e;
  }
}

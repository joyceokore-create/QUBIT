import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { ParseError, FILE_MAX_BYTES } from "@/server/status-report/parse";
import { previewStatusReport } from "@/server/status-report-upload";

// POST /api/reports/status-upload (multipart, field `file`) — parse the weekly status
// report and match its rows to the viewer's projects. Writes nothing; the PM reviews, then
// /apply fills the drafts. Node runtime: the Word/Excel readers use zlib, the PDF one pdfjs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Choose the status report file first." } }, { status: 400 });
  }
  if (file.size > FILE_MAX_BYTES) {
    return NextResponse.json({ error: { code: "TOO_LARGE", message: "The file is larger than 5 MB." } }, { status: 413 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const preview = await previewStatusReport(guard.ctx, buf, file.name);
    return NextResponse.json({ data: { ...preview, fileName: file.name, base64: buf.toString("base64") } });
  } catch (e) {
    if (e instanceof ParseError) return NextResponse.json({ error: { code: "UNREADABLE", message: e.message } }, { status: 422 });
    console.error("[status-upload] parse failed", e);
    return NextResponse.json({ error: { code: "UNREADABLE", message: "The file could not be read." } }, { status: 422 });
  }
}

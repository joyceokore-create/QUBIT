import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { BodyTooLargeError, MULTIPART_OVERHEAD_BYTES, readFormDataCapped } from "@/lib/body-limit";
import { ParseError, FILE_MAX_BYTES } from "@/server/status-report/parse";
import { previewStatusReport, UploadWeekError } from "@/server/status-report-upload";

// POST /api/reports/status-upload (multipart, field `file`) — parse the weekly status
// report and match its rows to the viewer's projects. Writes nothing; the PM reviews, then
// /apply fills the drafts by upload id (the file stays server-side). Lumi AI may read it
// (plan Phase 3), which can take a while for a scan. Node runtime: the Word/Excel readers use zlib, the PDF one pdfjs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  let form: FormData | null;
  try {
    // Refuse an oversized body before it is buffered, not after.
    form = await readFormDataCapped(req, FILE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ error: { code: "TOO_LARGE", message: "The file is larger than 5 MB." } }, { status: 413 });
    throw e;
  }
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Choose the status report file first." } }, { status: 400 });
  }
  if (file.size > FILE_MAX_BYTES) {
    return NextResponse.json({ error: { code: "TOO_LARGE", message: "The file is larger than 5 MB." } }, { status: 413 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const weekField = form?.get("week");
    // reader=lumi: the PM ticked "Read with Lumi" (plan Phase 3); otherwise Lumi steps in only when the rules find no lines.
    const reader = form?.get("reader") === "lumi" ? "lumi" : "auto";
    const preview = await previewStatusReport(guard.ctx, buf, file.name, typeof weekField === "string" ? weekField : null, new Date(), reader);
    return NextResponse.json({ data: { ...preview, fileName: file.name } });
  } catch (e) {
    if (e instanceof ParseError) return NextResponse.json({ error: { code: "UNREADABLE", message: e.message } }, { status: 422 });
    if (e instanceof UploadWeekError) return NextResponse.json({ error: { code: "BAD_WEEK", message: e.message } }, { status: 400 });
    console.error("[status-upload] parse failed", e);
    return NextResponse.json({ error: { code: "UNREADABLE", message: "The file could not be read." } }, { status: 422 });
  }
}

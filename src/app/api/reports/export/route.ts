import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { buildExport, ExportError, ExportRequest } from "@/server/pdf/export";
import { pdfAvailable, renderPdf } from "@/server/pdf/render";

/**
 * Milestone D — GET /api/reports/export?template=auto|build|market|dual|digest|table&project=
 *   &week=&portfolio=&dataset=&columns=&format=pdf|html
 * `format=html` returns the print document inline (the custom-reports preview iframe, and
 * the fallback people get when no Chromium is available); `format=pdf` renders it. The
 * permission rules live in buildExport. Playwright needs Node — never the edge runtime.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Disposition": "inline",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // Server-built strings only: no scripts, inline styles, inline SVG. Framed by /reports.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'",
};

const STATUS: Record<ExportError["code"], number> = { BAD_WEEK: 400, BAD_REQUEST: 400, FORBIDDEN: 403, NOT_FOUND: 404 };

export async function GET(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const sp = new URL(req.url).searchParams;
  const parsed = ExportRequest.safeParse({
    template: sp.get("template") ?? undefined,
    project: sp.get("project") ?? undefined,
    week: sp.get("week") ?? undefined,
    portfolio: sp.get("portfolio") ?? undefined,
    dataset: sp.get("dataset") ?? undefined,
    columns: sp.get("columns") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid export query." } }, { status: 400 });
  }
  const format = sp.get("format") === "html" ? "html" : "pdf";

  try {
    const report = await buildExport(guard.ctx, parsed.data);
    if (format === "html") return new NextResponse(report.html, { headers: HTML_HEADERS });
    if (!(await pdfAvailable())) {
      return NextResponse.json(
        { error: { code: "PDF_UNAVAILABLE", message: "PDF rendering is not available on this deployment — open the print view instead." } },
        { status: 503 },
      );
    }
    const pdf = await renderPdf(report.html, report.spec);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.filenameStem}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ExportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
    }
    console.error("[pdf] export failed", e);
    return NextResponse.json({ error: { code: "INTERNAL", message: "The report could not be rendered." } }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { forbidden, requirePermission } from "@/lib/api-guard";
import { csvFilename, toCsv } from "@/lib/csv";
import { QUALITY_CSV_COLUMNS } from "@/lib/quality-report";
import { getQualityReport, QualityReportError } from "@/server/quality-report";

// GET /api/reports/quality?format=csv|json — Reports › Quality's "Quality by project" table
// (UX9, D13). reports:read first (401/403 from the standard guard), then the Head-of-QA rule
// inside getQualityReport (403). The read runs under the caller's tenant RLS context; CSV
// goes through the one serializer (BOM + formula-injection guard). Same rows, same order as
// the screen — the browser-side search/filter is a view, the export is the whole table.

export const dynamic = "force-dynamic";

const Query = z.object({ format: z.enum(["csv", "json"]).default("csv") });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({ format: url.searchParams.get("format") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "format must be csv or json." } }, { status: 400 });
  }

  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;

  try {
    const report = await getQualityReport(guard.ctx);
    if (parsed.data.format === "json") {
      return NextResponse.json({ rows: report.rows, weekly: report.weekly }, { headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(toCsv(report.rows, QUALITY_CSV_COLUMNS), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename("quality-by-project")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof QualityReportError) return forbidden(e.message);
    throw e;
  }
}

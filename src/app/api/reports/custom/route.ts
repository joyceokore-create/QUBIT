import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, requireSession } from "@/lib/api-guard";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv";
import { REPORT_DATASET_KEYS, type ReportDatasetKey } from "@/lib/report-catalogue";
import {
  CustomReportError,
  DATASET_PERMISSION,
  runCustomReport,
  type ReportRow,
} from "@/server/custom-reports";

// GET /api/reports/custom?dataset=…&columns=a,b,c&format=json|csv — the Custom Reports
// engine's one door. The dataset decides the permission gate (same per-kind principle as
// /api/export); the column list is validated against the registry allow-list in
// runCustomReport. CSV goes through the one serializer (BOM + formula-injection guard).

export const dynamic = "force-dynamic";

const Query = z.object({
  dataset: z.enum(REPORT_DATASET_KEYS as [ReportDatasetKey, ...ReportDatasetKey[]]),
  columns: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((c) => c.trim()).filter(Boolean) : [])),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    dataset: url.searchParams.get("dataset") ?? undefined,
    columns: url.searchParams.get("columns") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: `dataset must be one of ${REPORT_DATASET_KEYS.join(" | ")}.` } },
      { status: 400 },
    );
  }
  const { dataset, columns, format } = parsed.data;

  const permission = DATASET_PERMISSION[dataset];
  const guard = permission ? await requirePermission(permission) : await requireSession();
  if ("response" in guard) return guard.response;

  try {
    const result = await runCustomReport(guard.ctx, dataset, columns);
    if (format === "csv") {
      const cols: CsvColumn<ReportRow>[] = result.columns.map((c) => ({ header: c.label, value: (r) => r[c.key] }));
      return new NextResponse(toCsv(result.rows, cols), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${csvFilename(`report-${dataset}`)}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ ...result, rowCount: result.rows.length });
  } catch (e) {
    if (e instanceof CustomReportError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

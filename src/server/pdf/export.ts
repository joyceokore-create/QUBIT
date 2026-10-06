import "server-only";
import { z } from "zod";
import { can } from "@/lib/rbac";
import type { TenantContext } from "@/lib/tenant";
import { isoWeekId, isValidIsoWeek } from "@/lib/iso-week";
import { REPORT_DATASET_KEYS, type ReportDatasetKey } from "@/lib/report-catalogue";
import { CustomReportError, DATASET_PERMISSION } from "@/server/custom-reports";
import { getDigestReport, getProjectReport, getTableReport } from "@/server/pdf/report-data";
import { renderDigest, renderProjectReport, renderTable, type RenderedReport } from "@/server/pdf/templates";

/**
 * Milestone D — one door for "give me this report as a document": the export route, the
 * email action and the custom-reports preview all resolve a request through here, so the
 * permission rules live in exactly one place:
 *   - project templates: project:read + the project visible under RLS (404 otherwise);
 *   - the digest: reports:read + getRollupWeek's visibility (Approved for non-Heads);
 *   - a data table: the dataset's own gate (DATASET_PERMISSION, as /api/reports/custom).
 */

export const EXPORT_TEMPLATES = ["auto", "build", "market", "dual", "digest", "table"] as const;
export type ExportTemplate = (typeof EXPORT_TEMPLATES)[number];

export const ExportRequest = z.object({
  template: z.enum(EXPORT_TEMPLATES).default("auto"),
  project: z.string().uuid().optional(),
  week: z.string().optional(),
  portfolio: z.string().uuid().optional(),
  dataset: z.enum(REPORT_DATASET_KEYS as [ReportDatasetKey, ...ReportDatasetKey[]]).optional(),
  columns: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((c) => c.trim()).filter(Boolean) : [])),
});
export type ExportRequestInput = z.infer<typeof ExportRequest>;

export class ExportError extends Error {
  constructor(
    message: string,
    public code: "BAD_WEEK" | "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND",
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportResult extends RenderedReport {
  kind: "project" | "digest" | "table";
  isoWeek: string;
  /** Subject-line material for the email action. */
  label: string;
  project?: { id: string; code: string; name: string };
}

/** Resolve `?week=`: default the current week; never a future one. */
export function resolveWeek(week: string | undefined, now: Date): string {
  const current = isoWeekId(now);
  if (!week) return current;
  if (!isValidIsoWeek(week) || week > current) throw new ExportError("Pass ?week=YYYY-Www, this week or earlier.", "BAD_WEEK");
  return week;
}

export async function buildExport(ctx: TenantContext, input: ExportRequestInput, now = new Date()): Promise<ExportResult> {
  if (input.template === "table") {
    if (!input.dataset) throw new ExportError("A data table needs ?dataset=.", "BAD_REQUEST");
    const permission = DATASET_PERMISSION[input.dataset];
    if (permission && !can(ctx, permission)) throw new ExportError("That module is not yours to report on.", "FORBIDDEN");
    try {
      const data = await getTableReport(ctx, input.dataset, input.columns, now);
      return { ...renderTable(data), kind: "table", isoWeek: isoWeekId(now), label: `${data.title} · custom report` };
    } catch (e) {
      if (e instanceof CustomReportError) throw new ExportError(e.message, "BAD_REQUEST");
      throw e;
    }
  }
  const isoWeek = resolveWeek(input.week, now);
  if (input.template === "digest") {
    if (!can(ctx, "reports:read")) throw new ExportError("The roll-up is for report readers.", "FORBIDDEN");
    const data = await getDigestReport(ctx, isoWeek, { portfolioId: input.portfolio, now });
    if (!data) throw new ExportError("No roll-up for that week.", "NOT_FOUND");
    return { ...renderDigest(data), kind: "digest", isoWeek, label: `Week ${data.week.number} roll-up` };
  }
  if (!input.project) throw new ExportError("A project one-pager needs ?project=.", "BAD_REQUEST");
  if (!can(ctx, "project:read")) throw new ExportError("Project reports need project access.", "FORBIDDEN");
  const data = await getProjectReport(ctx, input.project, isoWeek, now, input.template === "auto" ? undefined : input.template);
  if (!data) throw new ExportError("No such project.", "NOT_FOUND");
  return {
    ...renderProjectReport(data),
    kind: "project",
    isoWeek,
    label: `${data.project.code} · Week ${data.week.number} status report`,
    project: { id: data.project.id, code: data.project.code, name: data.project.name },
  };
}

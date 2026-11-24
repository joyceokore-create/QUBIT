import "server-only";
import type { TenantContext } from "@/lib/tenant";
import { canReadQualityReport } from "@/lib/reports-view";
import { sortQualityRows, type QualityRow, type WeeklyCount } from "@/lib/quality-report";
import { getCockpitData } from "@/server/dashboard-cockpit";
import { getQualityOverview } from "@/server/quality";

/**
 * UX9 (UX plan D13) — Reports › Quality: the one read behind the tab AND its CSV export, so
 * the two can't drift. Gated here (not just in the page) on the Head-of-QA rule — holds
 * HeadOfQA and reports:read — and read under the tenant's RLS context (getCockpitData and
 * getQualityOverview both run inside withTenant).
 */

export class QualityReportError extends Error {
  code = "FORBIDDEN" as const;
}

export interface QualityReport {
  timeZone: string;
  rows: QualityRow[];
  weekly: WeeklyCount[];
}

export async function getQualityReport(ctx: TenantContext, now = new Date()): Promise<QualityReport> {
  if (!canReadQualityReport(ctx)) throw new QualityReportError("The Quality report is for the Head of QA.");
  const cockpit = await getCockpitData(ctx, now);
  const q = await getQualityOverview(ctx, cockpit.projects, now, 8);
  const rows: QualityRow[] = q.projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    pmName: p.pmName,
    stage: p.currentGate,
    inTesting: p.inTesting,
    coveragePct: p.coveragePct,
    criticalOpen: p.criticalOpen,
    openBugs: { high: p.openBugs.high, medium: p.openBugs.medium, low: p.openBugs.low },
    overdueTests: p.overdueTests,
    unassignedTests: p.unassignedTests,
  }));
  return { timeZone: q.timeZone, rows: sortQualityRows(rows), weekly: q.weekly };
}

import { withTenant, type TenantContext } from "@/lib/tenant";

export type GapReason = "no_origin_risk" | "risk_unowned_or_unmitigated";

export interface GapReportItem {
  issueId: string;
  issueTitle: string;
  severity: string;
  status: string;
  projectCode: string | null;
  originRiskId: string | null;
  originRiskTitle: string | null;
  gapReason: GapReason;
}

export interface GapReportSummary {
  totalIssues: number;
  gapCount: number;
  traced: number;
  items: GapReportItem[];
}

// "Gap" per docs/09-ui-spec.md: an issue with no prior owned/mitigated risk. The schema
// keeps no historical snapshot of a risk's state at the moment an issue occurred (Risk rows
// are mutated in place), so "wasn't owned/mitigated AT THE TIME" isn't computable — this
// checks the risk's CURRENT owner/mitigation instead, which is the closest honest reading.
export async function getGapReport(ctx: TenantContext): Promise<GapReportSummary> {
  return withTenant(ctx, async (tx) => {
    const issues = await tx.issue.findMany({
      include: {
        project: { select: { code: true } },
        originRisk: { select: { id: true, title: true, ownerId: true, mitigation: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: GapReportItem[] = [];
    for (const issue of issues) {
      let gapReason: GapReason | null = null;
      if (!issue.originRisk) {
        gapReason = "no_origin_risk";
      } else if (!issue.originRisk.ownerId || !issue.originRisk.mitigation) {
        gapReason = "risk_unowned_or_unmitigated";
      }
      if (gapReason) {
        items.push({
          issueId: issue.id,
          issueTitle: issue.title,
          severity: issue.severity,
          status: issue.status,
          projectCode: issue.project?.code ?? null,
          originRiskId: issue.originRisk?.id ?? null,
          originRiskTitle: issue.originRisk?.title ?? null,
          gapReason,
        });
      }
    }

    return {
      totalIssues: issues.length,
      gapCount: items.length,
      traced: issues.length - items.length,
      items,
    };
  });
}

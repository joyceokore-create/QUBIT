import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { ownerNamesById } from "@/server/raid-shared";

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

/** Why an issue is a gap, or null when it traces to an owned, mitigated risk. */
export function gapReasonOf(originRisk: { ownerId: string | null; mitigation: string | null } | null): GapReason | null {
  if (!originRisk) return "no_origin_risk";
  if (!originRisk.ownerId || !originRisk.mitigation) return "risk_unowned_or_unmitigated";
  return null;
}

/**
 * UX5 (L4) — the same gap rule as `gapReasonOf`, as a Prisma filter, so the Gap report tab
 * pages and counts in the database. A null or empty mitigation counts as "unmitigated",
 * exactly like the `!mitigation` check above (tests/rls/raid-paging.test.ts holds the two
 * in step).
 */
export const GAP_ISSUE_WHERE: Prisma.IssueWhereInput = {
  OR: [
    { originRiskId: null },
    { originRisk: { is: { ownerId: null } } },
    { originRisk: { is: { mitigation: null } } },
    { originRisk: { is: { mitigation: "" } } },
  ],
};

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
      const gapReason = gapReasonOf(issue.originRisk);
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

// ── UX5 (L4) — tab counts and filter options for the Risks & Issues page ──────────

export interface RaidTabCounts {
  risks: number;
  issues: number;
  gaps: number;
}

/** Unfiltered tab counts. Issue counts are 0 unless the caller may read issues. */
export async function raidTabCounts(ctx: TenantContext, canReadIssues: boolean): Promise<RaidTabCounts> {
  return withTenant(ctx, async (tx) => {
    const [risks, issues, gaps] = await Promise.all([
      tx.risk.count(),
      canReadIssues ? tx.issue.count() : 0,
      canReadIssues ? tx.issue.count({ where: GAP_ISSUE_WHERE }) : 0,
    ]);
    return { risks, issues, gaps };
  });
}

export type RaidTab = "risks" | "issues" | "gap";

export interface RaidFacets {
  /** Projects that have at least one item on this tab, by code. */
  projects: { id: string; code: string; name: string }[];
  hasNoProject: boolean;
  /** Owners of at least one item on this tab, by name. */
  owners: { id: string; name: string }[];
  hasUnowned: boolean;
  /** Items on this tab the viewer owns (the "Mine" count). */
  mine: number;
}

/**
 * Filter options for one tab: only the projects and owners that actually appear there, so
 * no option leads to an empty table. Group-bys run under the tenant's RLS context.
 */
export async function raidFacets(ctx: TenantContext, tab: RaidTab): Promise<RaidFacets> {
  return withTenant(ctx, async (tx) => {
    const where = tab === "gap" ? GAP_ISSUE_WHERE : {};
    const [byProject, byOwner] =
      tab === "risks"
        ? await Promise.all([
            tx.risk.groupBy({ by: ["projectId"], _count: { _all: true } }),
            tx.risk.groupBy({ by: ["ownerId"], _count: { _all: true } }),
          ])
        : await Promise.all([
            tx.issue.groupBy({ by: ["projectId"], where, _count: { _all: true } }),
            tx.issue.groupBy({ by: ["ownerId"], where, _count: { _all: true } }),
          ]);

    const projectIds = byProject.map((r) => r.projectId).filter((id): id is string => !!id);
    const [projects, ownerNames] = await Promise.all([
      projectIds.length
        ? tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } })
        : Promise.resolve([]),
      ownerNamesById(tx, byOwner.map((r) => r.ownerId)),
    ]);

    return {
      projects,
      hasNoProject: byProject.some((r) => r.projectId === null),
      owners: [...ownerNames].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      hasUnowned: byOwner.some((r) => r.ownerId === null),
      mine: byOwner.find((r) => r.ownerId === ctx.userId)?._count._all ?? 0,
    };
  });
}

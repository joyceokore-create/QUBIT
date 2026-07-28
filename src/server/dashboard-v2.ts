import { withTenant, type TenantContext } from "@/lib/tenant";
import { getHeatmap, type HeatmapData } from "@/server/dashboard";
import { getDeltaFeed, type DeltaFeed } from "@/server/delta";
import { portfolioHealth, ragCounts, type PortfolioHealth } from "@/server/health";
import { getBriefing, type BriefingItem } from "@/server/relevance";

/**
 * Dashboard v2 (M1, docs/16-revamp-plan.md §3) — a dashboard answers three questions in
 * ten seconds: What needs me today? What changed since I last looked? What's at risk?
 * Everything else lives on its own page. One shared dashboard for every role (DM1.10);
 * role composition only reorders sections in the page.
 */

export interface KpiTrend {
  current: number;
  /** Oldest → newest daily values from PortfolioSnapshot. Empty until ≥2 nights accrue. */
  points: number[];
}

export interface PortfolioHealthRow {
  id: string;
  name: string;
  itemCount: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
}

export interface DashboardV2 {
  /** Max 5, ranked by the relevance engine. */
  priorities: BriefingItem[];
  health: PortfolioHealth;
  /** Every project's code+status — the health-parity contract with Q. */
  projects: { id: string; code: string; name: string; status: string }[];
  kpis: {
    onTrackPct: KpiTrend;
    overdueTasks: KpiTrend;
    /** current = people over-allocated; allocated = denominator for context. */
    capacity: KpiTrend & { allocated: number };
  };
  /** Portfolio × subsidiary heatmap — null for single-org-unit tenants (DM1.1). */
  heatmap: HeatmapData | null;
  /** Per-portfolio rollup shown instead of the heatmap when it is null. */
  portfolioList: PortfolioHealthRow[] | null;
  delta: DeltaFeed;
}

const SPARK_DAYS = 14;

export async function getDashboardV2(ctx: TenantContext): Promise<DashboardV2> {
  const now = new Date();
  const [priorities, delta, live] = await Promise.all([
    getBriefing(ctx, 5),
    getDeltaFeed(ctx),
    withTenant(ctx, async (tx) => {
      const [projects, overdueTasks, allocations, snapshots, orgUnitCount, portfolios] = await Promise.all([
        tx.project.findMany({
          select: { id: true, code: true, name: true, status: true, portfolioId: true },
          orderBy: { name: "asc" },
        }),
        tx.projectTask.count({
          where: { approvalStatus: { not: "Draft" }, status: { not: "Completed" }, dueDate: { lt: now } },
        }),
        tx.projectMember.groupBy({ by: ["userId"], _sum: { allocationPct: true } }),
        // Newest SPARK_DAYS rows; reversed below so sparklines read oldest → newest.
        tx.portfolioSnapshot.findMany({ orderBy: { day: "desc" }, take: SPARK_DAYS }),
        tx.orgUnit.count(),
        tx.portfolio.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      return { projects, overdueTasks, allocations, snapshots, orgUnitCount, portfolios };
    }),
  ]);

  const snapshots = [...live.snapshots].reverse();
  const trend = (pick: (s: (typeof snapshots)[number]) => number): number[] =>
    snapshots.length >= 2 ? snapshots.map(pick) : [];

  const health = portfolioHealth(live.projects.map((p) => p.status));
  const peopleAllocated = live.allocations.length;
  const peopleOverAllocated = live.allocations.filter((a) => (a._sum.allocationPct ?? 0) > 100).length;

  const multiOrgUnit = live.orgUnitCount > 1;
  const heatmap = multiOrgUnit ? await getHeatmap(ctx) : null;
  const portfolioList: PortfolioHealthRow[] | null = multiOrgUnit
    ? null
    : live.portfolios.map((portfolio) => {
        const items = live.projects.filter((p) => p.portfolioId === portfolio.id);
        const { onTrack, atRisk, overdue } = ragCounts(items);
        return { id: portfolio.id, name: portfolio.name, itemCount: items.length, onTrack, atRisk, overdue };
      });

  return {
    priorities,
    health,
    projects: live.projects.map(({ id, code, name, status }) => ({ id, code, name, status })),
    kpis: {
      onTrackPct: { current: health.pct, points: trend((s) => s.onTrackPct) },
      overdueTasks: { current: live.overdueTasks, points: trend((s) => s.tasksOverdue) },
      capacity: {
        current: peopleOverAllocated,
        allocated: peopleAllocated,
        points: trend((s) => s.peopleOverAllocated),
      },
    },
    heatmap,
    portfolioList,
    delta,
  };
}

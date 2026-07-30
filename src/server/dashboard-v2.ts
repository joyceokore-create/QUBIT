import { withTenant, type TenantContext } from "@/lib/tenant";
import { getDeltaFeed, type DeltaFeed } from "@/server/delta";
import { portfolioHealth, type PortfolioHealth } from "@/server/health";
import { listMyNudges, type MyNudge } from "@/server/nudger";
import { getBriefing, type BriefingItem } from "@/server/relevance";

/**
 * Dashboard v2 (M1, docs/16-revamp-plan.md §3) — a dashboard answers three questions in
 * ten seconds: What needs me today? What changed since I last looked? What's at risk?
 * Since M1c every persona has a dedicated preset, so this module's remaining job is the
 * shared engine surface (health/priorities/delta) and the health-parity contract with Q.
 * The old portfolio×subsidiary heatmap left with the M18-B amendment (DM1.30/DM1.31).
 */

export interface KpiTrend {
  current: number;
  /** Oldest → newest daily values from PortfolioSnapshot. Empty until ≥2 nights accrue. */
  points: number[];
}

export interface DashboardV2 {
  /** Max 5 — active nudges first, then relevance-ranked items (M3). */
  priorities: BriefingItem[];
  /** The viewer's active nudges — lets the strip offer per-item snooze (M3). */
  nudges: MyNudge[];
  health: PortfolioHealth;
  /** Every project's code+status — the health-parity contract with Q. */
  projects: { id: string; code: string; name: string; status: string }[];
  kpis: {
    onTrackPct: KpiTrend;
    overdueTasks: KpiTrend;
    /** current = people over-allocated; allocated = denominator for context. */
    capacity: KpiTrend & { allocated: number };
  };
  delta: DeltaFeed;
}

const SPARK_DAYS = 14;

/** Active nudges outrank relevance guesses — the nudger KNOWS these need the viewer. */
export function mergeNudgesIntoPriorities(nudges: MyNudge[], briefing: BriefingItem[], limit = 5): BriefingItem[] {
  const nudgeItems: BriefingItem[] = nudges.map((n) => ({
    id: n.entityId,
    kind: "nudge",
    title: n.message,
    meta: n.escalationLevel > 0 ? "NUDGE · ESCALATED" : "NUDGE",
    severity: n.escalationLevel > 0 ? "red" : "amber",
    href: n.link ?? "/my-tasks",
  }));
  const nudgedEntities = new Set(nudgeItems.map((n) => n.id));
  return [...nudgeItems, ...briefing.filter((b) => !nudgedEntities.has(b.id))].slice(0, limit);
}

export async function getDashboardV2(ctx: TenantContext): Promise<DashboardV2> {
  const now = new Date();
  const [briefing, nudges, delta, live] = await Promise.all([
    getBriefing(ctx, 5),
    listMyNudges(ctx, now),
    getDeltaFeed(ctx),
    withTenant(ctx, async (tx) => {
      const [projects, overdueTasks, allocations, snapshots] = await Promise.all([
        tx.project.findMany({
          select: { id: true, code: true, name: true, status: true },
          orderBy: { name: "asc" },
        }),
        tx.projectTask.count({
          where: { approvalStatus: { not: "Draft" }, status: { not: "Completed" }, dueDate: { lt: now } },
        }),
        tx.projectMember.groupBy({ by: ["userId"], _sum: { allocationPct: true } }),
        // Newest SPARK_DAYS rows; reversed below so sparklines read oldest → newest.
        tx.portfolioSnapshot.findMany({ orderBy: { day: "desc" }, take: SPARK_DAYS }),
      ]);
      return { projects, overdueTasks, allocations, snapshots };
    }),
  ]);

  const snapshots = [...live.snapshots].reverse();
  const trend = (pick: (s: (typeof snapshots)[number]) => number): number[] =>
    snapshots.length >= 2 ? snapshots.map(pick) : [];

  const health = portfolioHealth(live.projects.map((p) => p.status));
  const peopleAllocated = live.allocations.length;
  const peopleOverAllocated = live.allocations.filter((a) => (a._sum.allocationPct ?? 0) > 100).length;

  return {
    priorities: mergeNudgesIntoPriorities(nudges, briefing),
    nudges,
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
    delta,
  };
}

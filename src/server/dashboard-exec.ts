import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { getDeltaFeed, type DeltaFeed } from "@/server/delta";
import { needsAttention, portfolioHealth, type PortfolioHealth } from "@/server/health";
import { listMyNudges, type MyNudge } from "@/server/nudger";
import { mergeNudgesIntoPriorities } from "@/server/dashboard-v2";
import { getPortfolioSections, type PortfolioSectionsData } from "@/server/pipeline";
import { getRolloutMatrices, type RolloutMatrix } from "@/server/rollout";
import { getBriefing, type BriefingItem } from "@/server/relevance";

/**
 * Executive preset data (docs/17 §2). Everything is grounded: health from the one
 * engine, deltas from nightly snapshots, the decision queue from live escalations /
 * unconfirmed check-ins / pending draft approvals. Stage-gate approvals join the queue
 * when the M8 stage machine exists — no placeholder rows before then (§9).
 */

// The global KPI strip was REMOVED per docs/18 §0 decision №1 — its stats live as
// per-project chips on the pipeline table rows (src/server/pipeline.ts).

export interface HealthTrend {
  score: number; // portfolioHealth.pct, 0–100
  wow: number | null;
  /** Weekly points (latest snapshot per ISO week), oldest → newest, up to 8. */
  weekly: number[];
  /** The "why?" popover — the engine's actual composition, never an unexplained number. */
  factors: {
    onTrack: number;
    needAttention: number;
    planning: number;
    overdueTasks: number;
    escalationsOpen: number;
  };
}

export interface DecisionQueueRow {
  kind: "escalation" | "checkin" | "drafts";
  title: string;
  project: string | null;
  ageDays: number;
  href: string;
}

export interface ExecutiveDashboard {
  priorities: BriefingItem[];
  nudges: MyNudge[];
  decisionCount: number;
  health: PortfolioHealth;
  healthTrend: HealthTrend;
  decisionQueue: DecisionQueueRow[];
  /** Amended docs/18 §6 — one collapsible section per portfolio, worst health first.
   * This replaced the flat pipeline table AND the portfolio × subsidiary heatmap
   * (its RAG+Δ signal now lives on each section header). */
  sections: PortfolioSectionsData;
  /** docs/18 §6 — the project × market heatmap for each Rollout portfolio. */
  rolloutMatrices: RolloutMatrix[];
  delta: DeltaFeed;
  /** code+status of every project — the health-parity contract with Q. */
  projects: { id: string; code: string; name: string; status: string }[];
}

const day = 86_400_000;

export async function getExecutiveDashboard(ctx: TenantContext): Promise<ExecutiveDashboard> {
  const now = new Date();
  const isoWeek = isoWeekId(now);

  const [briefing, nudges, delta, live] = await Promise.all([
    getBriefing(ctx, 5),
    listMyNudges(ctx, now),
    getDeltaFeed(ctx),
    withTenant(ctx, async (tx) => {
      const [projects, snapshots, escalations, unconfirmed, draftGroups, overdueTasks] = await Promise.all([
        tx.project.findMany({
          select: { id: true, code: true, name: true, status: true },
          orderBy: { name: "asc" },
        }),
        tx.portfolioSnapshot.findMany({ orderBy: { day: "desc" }, take: 60 }),
        tx.nudge.findMany({
          where: { isoWeek, escalationLevel: { gte: 1 } },
          orderBy: [{ escalationLevel: "desc" }, { sentAt: "asc" }],
          select: { id: true, message: true, link: true, sentAt: true, project: { select: { name: true } } },
        }),
        tx.checkIn.findMany({
          where: { isoWeek, status: "Draft", project: { status: { notIn: ["Completed", "Cancelled"] } } },
          select: { id: true, createdAt: true, projectId: true, project: { select: { name: true } } },
        }),
        tx.projectTask.groupBy({
          by: ["projectId"],
          where: { approvalStatus: "Draft" },
          _count: { _all: true },
          _min: { createdAt: true },
        }),
        tx.projectTask.count({
          where: { approvalStatus: { not: "Draft" }, status: { not: "Completed" }, dueDate: { lt: now } },
        }),
      ]);
      return { projects, snapshots, escalations, unconfirmed, draftGroups, overdueTasks };
    }),
  ]);

  const health = portfolioHealth(live.projects.map((p) => p.status));
  const snapshots = [...live.snapshots].reverse(); // oldest → newest

  // Weekly health trend: the latest snapshot of each ISO week, up to 8 weeks (17 §2 —
  // the trend survives the docs/18 KPI-strip removal).
  const byWeek = new Map<string, number>();
  for (const s of snapshots) byWeek.set(isoWeekId(s.day), s.onTrackPct); // later days overwrite
  const weekly = [...byWeek.values()].slice(-8);
  const weekAgoSnap = [...snapshots].reverse().find((s) => now.getTime() - s.day.getTime() >= 6 * day);
  const healthWow = weekAgoSnap ? health.pct - weekAgoSnap.onTrackPct : null;

  // ── Decision queue (§2): the exec's job in one table ─────────────────────────
  const ageDays = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / day));
  const projectById = new Map(live.projects.map((p) => [p.id, p]));
  const decisionQueue: DecisionQueueRow[] = [
    ...live.escalations.map((e) => ({
      kind: "escalation" as const,
      title: e.message,
      project: e.project?.name ?? null,
      ageDays: ageDays(e.sentAt),
      href: e.link ?? "/risks",
    })),
    ...live.unconfirmed.map((c) => ({
      kind: "checkin" as const,
      title: `Check-in unconfirmed — computed status will ship in the Friday report`,
      project: c.project.name,
      ageDays: ageDays(c.createdAt),
      href: `/projects/${c.projectId}`,
    })),
    ...live.draftGroups.map((g) => ({
      kind: "drafts" as const,
      title: `${g._count._all} AI draft${g._count._all === 1 ? "" : "s"} awaiting approval`,
      project: projectById.get(g.projectId)?.name ?? null,
      ageDays: g._min.createdAt ? ageDays(g._min.createdAt) : 0,
      href: `/projects/${g.projectId}?tab=Board`,
    })),
  ].slice(0, 12);

  // Amended docs/18 §6: the heatmap that lived here was replaced by per-section RAG+Δ
  // on the portfolio sections themselves; the rollout heatmap returns per-portfolio
  // (viewKind=Rollout) with M-D's market tracks.
  const [sections, rolloutMatrices] = await Promise.all([getPortfolioSections(ctx, now), getRolloutMatrices(ctx, now)]);

  return {
    priorities: mergeNudgesIntoPriorities(nudges, briefing),
    nudges,
    decisionCount: decisionQueue.length,
    health,
    healthTrend: {
      score: health.pct,
      wow: healthWow,
      weekly,
      factors: {
        onTrack: health.onTrack,
        needAttention: health.needAttention,
        planning: health.planning,
        overdueTasks: live.overdueTasks,
        escalationsOpen: live.escalations.length,
      },
    },
    decisionQueue,
    sections,
    rolloutMatrices,
    delta,
    projects: live.projects.map(({ id, code, name, status }) => ({ id, code, name, status })),
  };
}

/** Re-export for the parity test: the exec preset must classify like everything else. */
export { needsAttention };

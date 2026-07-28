import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { getDeltaFeed, type DeltaFeed } from "@/server/delta";
import { needsAttention, portfolioHealth, projectRag, ragRank, worstStatus, type PortfolioHealth, type Rag } from "@/server/health";
import { listMyNudges, type MyNudge } from "@/server/nudger";
import { mergeNudgesIntoPriorities } from "@/server/dashboard-v2";
import { getBriefing, type BriefingItem } from "@/server/relevance";

/**
 * Executive preset data (docs/17 §2). Everything is grounded: health from the one
 * engine, deltas from nightly snapshots, the decision queue from live escalations /
 * unconfirmed check-ins / pending draft approvals. Stage-gate approvals join the queue
 * when the M8 stage machine exists — no placeholder rows before then (§9).
 */

export interface ExecKpi {
  current: number;
  /** Week-over-week delta from snapshots; null until enough history accrues. */
  wow: number | null;
  /** Daily points, oldest → newest (empty until ≥2 nights). */
  points: number[];
}

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

export interface HeatmapV2Cell {
  axisId: string;
  rag: Rag;
  /** RAG movement vs ~7 days ago: -1 improved · 0 flat · 1 worsened; null without history. */
  delta: -1 | 0 | 1 | null;
  count: number;
  avgProgress: number;
}

export interface HeatmapV2 {
  /** "subsidiary" for multi-org-unit tenants (KCB); "department" for flat ones (DM1.1). */
  axis: "subsidiary" | "department";
  columns: { id: string; label: string }[];
  rows: { portfolioId: string; portfolioName: string; cells: (HeatmapV2Cell | null)[] }[];
}

export interface MilestoneRow {
  id: string;
  text: string;
  due: Date;
  overdue: boolean;
}

export interface RiskRow {
  id: string;
  title: string;
  heat: number;
  projectCode: string | null;
}

export interface ExecutiveDashboard {
  priorities: BriefingItem[];
  nudges: MyNudge[];
  decisionCount: number;
  health: PortfolioHealth;
  healthTrend: HealthTrend;
  kpis: { onTrackPct: ExecKpi; atRisk: ExecKpi; escalations: ExecKpi; capacity: ExecKpi & { allocated: number } };
  decisionQueue: DecisionQueueRow[];
  heatmap: HeatmapV2;
  milestones30d: MilestoneRow[];
  topRisks: RiskRow[];
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
      const [
        projects,
        orgUnits,
        departments,
        portfolios,
        snapshots,
        weekAgoProjectSnaps,
        escalations,
        unconfirmed,
        draftGroups,
        overdueTasks,
        allocations,
        milestones,
        risks,
        leads,
      ] = await Promise.all([
        tx.project.findMany({
          select: { id: true, code: true, name: true, status: true, portfolioId: true, leadUserId: true, orgStatuses: { select: { orgUnitId: true, progress: true, status: true } } },
          orderBy: { name: "asc" },
        }),
        tx.orgUnit.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, flag: true } }),
        tx.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        tx.portfolio.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        tx.portfolioSnapshot.findMany({ orderBy: { day: "desc" }, take: 60 }),
        tx.projectSnapshot.findMany({
          where: { day: { lte: new Date(now.getTime() - 6 * day), gte: new Date(now.getTime() - 10 * day) } },
          orderBy: { day: "desc" },
          select: { projectId: true, status: true, day: true },
        }),
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
        tx.projectMember.groupBy({ by: ["userId"], _sum: { allocationPct: true } }),
        tx.projectMilestone.findMany({
          where: { status: { not: "Done" }, dueDate: { not: null, lt: new Date(now.getTime() + 30 * day) } },
          orderBy: { dueDate: "asc" },
          take: 8,
          select: { id: true, name: true, dueDate: true, project: { select: { name: true } } },
        }),
        tx.risk.findMany({
          where: { status: { notIn: ["Closed", "Mitigated"] } },
          select: { id: true, title: true, probability: true, impact: true, project: { select: { code: true } } },
        }),
        tx.user.findMany({
          where: { projectsLed: { some: {} } },
          select: { id: true, departmentId: true },
        }),
      ]);
      return { projects, orgUnits, departments, portfolios, snapshots, weekAgoProjectSnaps, escalations, unconfirmed, draftGroups, overdueTasks, allocations, milestones, risks, leads };
    }),
  ]);

  const health = portfolioHealth(live.projects.map((p) => p.status));
  const snapshots = [...live.snapshots].reverse(); // oldest → newest

  const kpi = (current: number, pick: (s: (typeof snapshots)[number]) => number): ExecKpi => {
    const points = snapshots.length >= 2 ? snapshots.slice(-14).map(pick) : [];
    const weekAgo = [...snapshots].reverse().find((s) => now.getTime() - s.day.getTime() >= 6 * day);
    return { current, wow: weekAgo ? current - pick(weekAgo) : null, points };
  };

  // Weekly health trend: the latest snapshot of each ISO week, up to 8 weeks (§2).
  const byWeek = new Map<string, number>();
  for (const s of snapshots) byWeek.set(isoWeekId(s.day), s.onTrackPct); // later days overwrite
  const weekly = [...byWeek.values()].slice(-8);
  const healthKpi = kpi(health.pct, (s) => s.onTrackPct);

  const peopleAllocated = live.allocations.length;
  const overAllocated = live.allocations.filter((a) => (a._sum.allocationPct ?? 0) > 100).length;

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

  // ── Heatmap (§2): one encoding per cell — RAG + Δ vs last week ───────────────
  const lastWeekStatus = new Map<string, string>(); // projectId → status ~7d ago (latest in window)
  for (const s of live.weekAgoProjectSnaps) if (!lastWeekStatus.has(s.projectId)) lastWeekStatus.set(s.projectId, s.status);

  const multiOrgUnit = live.orgUnits.length > 1;
  const deptByLead = new Map(live.leads.map((l) => [l.id, l.departmentId]));
  const UNASSIGNED = "unassigned";
  const columns = multiOrgUnit
    ? live.orgUnits.map((o) => ({ id: o.id, label: `${o.flag ?? ""} ${o.name}`.trim() }))
    : [...live.departments.map((d) => ({ id: d.id, label: d.name })), { id: UNASSIGNED, label: "Unassigned" }];

  const projectColumn = (p: (typeof live.projects)[number]): string[] => {
    if (multiOrgUnit) return p.orgStatuses.map((os) => os.orgUnitId);
    // Flat tenants (DM1.1): a project's column is its LEAD's department (DM1.27).
    const dept = p.leadUserId ? deptByLead.get(p.leadUserId) : null;
    return [dept ?? UNASSIGNED];
  };

  const rows = live.portfolios.map((portfolio) => {
    const items = live.projects.filter((p) => p.portfolioId === portfolio.id);
    const cells = columns.map((col): HeatmapV2Cell | null => {
      const inCell = items.filter((p) => projectColumn(p).includes(col.id));
      if (inCell.length === 0) return null;
      const statuses = inCell.map((p) => p.status);
      const current = worstStatus(statuses);
      const prevStatuses = inCell.map((p) => lastWeekStatus.get(p.id)).filter((s): s is string => !!s);
      const prev = prevStatuses.length === inCell.length ? worstStatus(prevStatuses) : null;
      const delta = prev === null ? null : (Math.sign(ragRank(current) - ragRank(prev)) as -1 | 0 | 1);
      const progress = multiOrgUnit
        ? inCell.flatMap((p) => p.orgStatuses.filter((os) => os.orgUnitId === col.id).map((os) => os.progress))
        : inCell.flatMap((p) => p.orgStatuses.map((os) => os.progress));
      return {
        axisId: col.id,
        rag: projectRag(current),
        delta,
        count: inCell.length,
        avgProgress: progress.length ? Math.round(progress.reduce((a, b) => a + b, 0) / progress.length) : 0,
      };
    });
    return { portfolioId: portfolio.id, portfolioName: portfolio.name, cells };
  });

  const topRisks = live.risks
    .map((r) => ({ id: r.id, title: r.title, heat: r.probability * r.impact, projectCode: r.project?.code ?? null }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 5);

  return {
    priorities: mergeNudgesIntoPriorities(nudges, briefing),
    nudges,
    decisionCount: decisionQueue.length,
    health,
    healthTrend: {
      score: health.pct,
      wow: healthKpi.wow,
      weekly,
      factors: {
        onTrack: health.onTrack,
        needAttention: health.needAttention,
        planning: health.planning,
        overdueTasks: live.overdueTasks,
        escalationsOpen: live.escalations.length,
      },
    },
    kpis: {
      onTrackPct: kpi(health.pct, (s) => s.onTrackPct),
      atRisk: kpi(health.needAttention, (s) => s.needAttention),
      escalations: kpi(live.escalations.length, (s) => s.escalationsOpen),
      capacity: { ...kpi(overAllocated, (s) => s.peopleOverAllocated), allocated: peopleAllocated },
    },
    decisionQueue,
    heatmap: { axis: multiOrgUnit ? "subsidiary" : "department", columns, rows },
    milestones30d: live.milestones.map((m) => ({
      id: m.id,
      text: `${m.project.name} — ${m.name}`,
      due: m.dueDate!,
      overdue: m.dueDate! < now,
    })),
    topRisks,
    delta,
    projects: live.projects.map(({ id, code, name, status }) => ({ id, code, name, status })),
  };
}

/** Re-export for the parity test: the exec preset must classify like everything else. */
export { needsAttention };

import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { avgProgress } from "@/server/dashboard";
import { projectRag, ragRank, worstStatus, type Rag } from "@/server/health";
import { PIPELINE_STAGES, type PipelineStage } from "@/server/projects";

/**
 * Portfolio-grouped delivery data (docs/18 §3.0 + amended §6): the dashboard renders
 * ONE section per portfolio, worst health first, Unassigned last and only when
 * non-empty. Each section's body is its `viewKind` lens — Pipeline renders the
 * stage-grouped table below; Rollout renders the project × market heatmap when M-D
 * lands (until then it honestly renders the pipeline lens too). Section roll-ups are
 * derived bottom-up through the ONE health engine; per-row stat chips replaced the
 * global KPI strip (18 §0 decision №1).
 */

const PM_PROJECT_ROLES = ["Project Manager"];
const day = 86_400_000;

export interface PipelineChips {
  risksOpen: number;
  milestonesUpcoming: number;
  milestonesOverdue: number;
  /** Tasks completed in the last 7 days. */
  velocity7d: number;
  health: Rag;
  /** Allocated members on the project. */
  resources: number;
}

export interface PipelineRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priority: string;
  progress: number;
  /** statusNote ?? latest confirmed check-in narrative (docs/18 §7). */
  note: string | null;
  unconfirmed: boolean;
  isMine: boolean;
  openBlockers: number;
  chips: PipelineChips;
}

export interface PipelineGroup {
  stage: PipelineStage;
  rows: PipelineRow[];
}

export interface PipelineTableData {
  groups: PipelineGroup[];
  total: number;
  mineCount: number;
}

export interface PortfolioSection {
  id: string;
  name: string;
  viewKind: "Pipeline" | "Rollout";
  /** Worst-of children through the health engine (docs/18 §3.0 roll-up). */
  rag: Rag;
  /** Worst-of movement vs ~7 days ago: -1 improved · 0 flat · 1 worsened; null w/o history. */
  ragDelta: -1 | 0 | 1 | null;
  /** Average derived progress of children. */
  progress: number;
  openBlockers: number;
  ownerName: string | null;
  isUnassigned: boolean;
  projectCount: number;
  /** The section body — always available; Rollout portfolios ALSO get this as the
   * interim lens until M-D ships market tracks. */
  pipeline: PipelineTableData;
}

export interface PortfolioSectionsData {
  sections: PortfolioSection[];
  total: number;
  mineCount: number;
}

function groupByStage(rows: (PipelineRow & { stage: PipelineStage })[]): PipelineTableData {
  return {
    groups: PIPELINE_STAGES.map((stage) => ({ stage, rows: rows.filter((r) => r.stage === stage) })).filter(
      (g) => g.rows.length > 0,
    ),
    total: rows.length,
    mineCount: rows.filter((r) => r.isMine).length,
  };
}

export async function getPortfolioSections(ctx: TenantContext, now = new Date()): Promise<PortfolioSectionsData> {
  const isoWeek = isoWeekId(now);
  const since7d = new Date(now.getTime() - 7 * day);

  const live = await withTenant(ctx, async (tx) => {
    const [portfolios, projects, checkIns, riskAgg, milestones, velocityAgg, memberAgg, blockerAgg, weekAgoSnaps] =
      await Promise.all([
        tx.portfolio.findMany({
          select: { id: true, name: true, viewKind: true, ownerId: true },
          orderBy: { name: "asc" },
        }),
        tx.project.findMany({
          where: { status: { notIn: ["Completed", "Cancelled"] } },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            priority: true,
            pipelineStage: true,
            statusNote: true,
            portfolioId: true,
            leadUserId: true,
            orgStatuses: { select: { progress: true } },
            members: { where: { role: { in: PM_PROJECT_ROLES } }, select: { userId: true } },
          },
          orderBy: [{ priority: "asc" }, { name: "asc" }],
        }),
        tx.checkIn.findMany({ where: { isoWeek }, select: { projectId: true, status: true, narrative: true } }),
        tx.risk.groupBy({ by: ["projectId"], where: { status: { notIn: ["Closed", "Mitigated"] } }, _count: { _all: true } }),
        tx.projectMilestone.findMany({ where: { status: { not: "Done" }, dueDate: { not: null } }, select: { projectId: true, dueDate: true } }),
        tx.projectTask.groupBy({
          by: ["projectId"],
          where: { approvalStatus: { not: "Draft" }, status: "Completed", updatedAt: { gte: since7d } },
          _count: { _all: true },
        }),
        tx.projectMember.groupBy({ by: ["projectId"], _count: { _all: true } }),
        tx.blocker.groupBy({ by: ["projectId"], where: { status: "Open" }, _count: { _all: true } }),
        tx.projectSnapshot.findMany({
          where: { day: { lte: new Date(now.getTime() - 6 * day), gte: new Date(now.getTime() - 10 * day) } },
          orderBy: { day: "desc" },
          select: { projectId: true, status: true },
        }),
      ]);
    const ownerIds = portfolios.map((p) => p.ownerId).filter((o): o is string => !!o);
    const owners = ownerIds.length
      ? await tx.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
      : [];
    return { portfolios, projects, checkIns, riskAgg, milestones, velocityAgg, memberAgg, blockerAgg, weekAgoSnaps, owners };
  });

  const checkinByProject = new Map(live.checkIns.map((c) => [c.projectId, c]));
  const risksByProject = new Map(live.riskAgg.filter((r) => r.projectId).map((r) => [r.projectId as string, r._count._all]));
  const velocityByProject = new Map(live.velocityAgg.map((v) => [v.projectId, v._count._all]));
  const membersByProject = new Map(live.memberAgg.map((m) => [m.projectId, m._count._all]));
  const blockersByProject = new Map(live.blockerAgg.map((b) => [b.projectId, b._count._all]));
  const ownerNameById = new Map(live.owners.map((o) => [o.id, o.name]));
  const lastWeekStatus = new Map<string, string>();
  for (const s of live.weekAgoSnaps) if (!lastWeekStatus.has(s.projectId)) lastWeekStatus.set(s.projectId, s.status);
  const milestonesUp = new Map<string, number>();
  const milestonesOver = new Map<string, number>();
  for (const m of live.milestones) {
    const bucket = m.dueDate! < now ? milestonesOver : milestonesUp;
    bucket.set(m.projectId, (bucket.get(m.projectId) ?? 0) + 1);
  }

  const rows = live.projects.map((p) => {
    const checkin = checkinByProject.get(p.id);
    const confirmed = checkin?.status === "Confirmed";
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      priority: p.priority,
      progress: avgProgress(p),
      note: p.statusNote ?? (confirmed ? (checkin?.narrative ?? null) : null),
      unconfirmed: !confirmed,
      isMine: p.leadUserId === ctx.userId || p.members.some((m) => m.userId === ctx.userId),
      openBlockers: blockersByProject.get(p.id) ?? 0,
      status: p.status,
      portfolioId: p.portfolioId,
      stage: (PIPELINE_STAGES as readonly string[]).includes(p.pipelineStage)
        ? (p.pipelineStage as PipelineStage)
        : ("Exploring" as PipelineStage),
      chips: {
        risksOpen: risksByProject.get(p.id) ?? 0,
        milestonesUpcoming: milestonesUp.get(p.id) ?? 0,
        milestonesOverdue: milestonesOver.get(p.id) ?? 0,
        velocity7d: velocityByProject.get(p.id) ?? 0,
        health: projectRag(p.status),
        resources: membersByProject.get(p.id) ?? 0,
      },
    };
  });

  const sections: PortfolioSection[] = live.portfolios
    .map((portfolio) => {
      const isUnassigned = portfolio.name === "Unassigned";
      // Rows with a null portfolioId (pre-backfill writes, raw inserts) fold into the
      // Unassigned section rather than vanishing — the display self-heals (18 §0.5).
      const children = rows.filter((r) => r.portfolioId === portfolio.id || (isUnassigned && r.portfolioId === null));
      const statuses = children.map((c) => c.status);
      const current = statuses.length ? worstStatus(statuses) : "OnTrack";
      const prevStatuses = children.map((c) => lastWeekStatus.get(c.id)).filter((s): s is string => !!s);
      const prev = prevStatuses.length === children.length && children.length > 0 ? worstStatus(prevStatuses) : null;
      return {
        id: portfolio.id,
        name: portfolio.name,
        viewKind: portfolio.viewKind === "Rollout" ? ("Rollout" as const) : ("Pipeline" as const),
        rag: projectRag(current),
        ragDelta: prev === null ? null : (Math.sign(ragRank(current) - ragRank(prev)) as -1 | 0 | 1),
        progress: children.length ? Math.round(children.reduce((a, c) => a + c.progress, 0) / children.length) : 0,
        openBlockers: children.reduce((a, c) => a + c.openBlockers, 0),
        ownerName: portfolio.ownerId ? (ownerNameById.get(portfolio.ownerId) ?? null) : null,
        isUnassigned,
        projectCount: children.length,
        pipeline: groupByStage(children),
      };
    })
    // Unassigned renders last and only when non-empty (docs/18 §0.5); empty regular
    // portfolios keep their header so execs see the whole book.
    .filter((s) => !s.isUnassigned || s.projectCount > 0)
    .sort((a, b) => {
      if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
      const rank = (r: Rag) => (r === "Red" ? 0 : r === "Amber" ? 1 : 2);
      return rank(a.rag) - rank(b.rag) || a.name.localeCompare(b.name);
    });

  return {
    sections,
    total: rows.length,
    mineCount: rows.filter((r) => r.isMine).length,
  };
}

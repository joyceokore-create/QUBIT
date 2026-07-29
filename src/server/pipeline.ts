import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { avgProgress } from "@/server/dashboard";
import { projectRag, type Rag } from "@/server/health";
import { PIPELINE_STAGES, type PipelineStage } from "@/server/projects";

/**
 * The portfolio pipeline table (docs/18 §1): projects grouped by pipeline stage, each
 * row carrying the per-project stat chips that REPLACED the global KPI strip (18 §0
 * decision №1). Everything on a row is derived or has a workspace edit path (§7):
 * stage/priority/note are edited on the Overview; %, health, and every chip are
 * computed. Checkpoint ticks join in M-D — until checkpoint data exists the column
 * shows derived progress %, never placeholder ticks.
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

export async function getPipelineTable(ctx: TenantContext, now = new Date()): Promise<PipelineTableData> {
  const isoWeek = isoWeekId(now);
  const since7d = new Date(now.getTime() - 7 * day);

  const live = await withTenant(ctx, async (tx) => {
    const [projects, checkIns, riskAgg, milestones, velocityAgg, memberAgg] = await Promise.all([
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
          leadUserId: true,
          orgStatuses: { select: { progress: true } },
          members: { where: { role: { in: PM_PROJECT_ROLES } }, select: { userId: true } },
        },
        orderBy: [{ priority: "asc" }, { name: "asc" }],
      }),
      tx.checkIn.findMany({
        where: { isoWeek },
        select: { projectId: true, status: true, narrative: true },
      }),
      tx.risk.groupBy({
        by: ["projectId"],
        where: { status: { notIn: ["Closed", "Mitigated"] } },
        _count: { _all: true },
      }),
      tx.projectMilestone.findMany({
        where: { status: { not: "Done" }, dueDate: { not: null } },
        select: { projectId: true, dueDate: true },
      }),
      tx.projectTask.groupBy({
        by: ["projectId"],
        where: { approvalStatus: { not: "Draft" }, status: "Completed", updatedAt: { gte: since7d } },
        _count: { _all: true },
      }),
      tx.projectMember.groupBy({ by: ["projectId"], _count: { _all: true } }),
    ]);
    return { projects, checkIns, riskAgg, milestones, velocityAgg, memberAgg };
  });

  const checkinByProject = new Map(live.checkIns.map((c) => [c.projectId, c]));
  const risksByProject = new Map(live.riskAgg.filter((r) => r.projectId).map((r) => [r.projectId as string, r._count._all]));
  const velocityByProject = new Map(live.velocityAgg.map((v) => [v.projectId, v._count._all]));
  const membersByProject = new Map(live.memberAgg.map((m) => [m.projectId, m._count._all]));
  const milestonesUp = new Map<string, number>();
  const milestonesOver = new Map<string, number>();
  for (const m of live.milestones) {
    const bucket = m.dueDate! < now ? milestonesOver : milestonesUp;
    bucket.set(m.projectId, (bucket.get(m.projectId) ?? 0) + 1);
  }

  const rows: (PipelineRow & { stage: PipelineStage })[] = live.projects.map((p) => {
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
      stage: (PIPELINE_STAGES as readonly string[]).includes(p.pipelineStage)
        ? (p.pipelineStage as PipelineStage)
        : "Exploring",
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

  return {
    groups: PIPELINE_STAGES.map((stage) => ({ stage, rows: rows.filter((r) => r.stage === stage) })),
    total: rows.length,
    mineCount: rows.filter((r) => r.isMine).length,
  };
}

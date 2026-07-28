import { withTenant, type TenantContext } from "@/lib/tenant";
import { getDashboardSummary, getUpcomingMilestones, avgProgress, type UpcomingMilestone } from "@/server/dashboard";
import { portfolioHealth } from "@/server/health";
import { getBriefing, type BriefingItem } from "@/server/relevance";
import { listWorkload } from "@/server/resources";
import { listRisks } from "@/server/risks";
import { listNotifications, type NotificationRow } from "@/server/notifications";

// Data for the exec dashboard. Every number is grounded in live tenant data. The
// deterministic string generators that rendered as "AI executive brief" / "AI insights" /
// "Recommendations" were cut in M0 (docs/16-revamp-plan.md §2) — interactive AI stays in
// the Q drawer, where it is real, gated, and logged.

export interface ExecKpis {
  projects: number;
  onTrack: number;
  needAttention: number;
  risksOpen: number;
  milestonesUpcoming: number;
  milestonesOverdue: number;
  velocity7d: number; // tasks completed in the last 7 days (published)
  healthPct: number;
  peopleAllocated: number;
  overAllocated: number;
  budget: string;
}

export interface ExecProjectRow {
  id: string;
  code: string;
  name: string;
  status: string;
  avgProgress: number;
  ownerName: string | null;
  dueDate: Date | null;
}

export interface ExecTopRisk {
  id: string;
  title: string;
  heat: number; // probability × impact (of 25)
  projectCode: string | null;
}

export interface ExecCapacity {
  userId: string;
  name: string;
  totalPct: number;
}

export interface ExecDashboard {
  priorities: BriefingItem[];
  health: { onTrack: number; needAttention: number; planning: number; total: number; pct: number };
  notifications: NotificationRow[];
  kpis: ExecKpis;
  projects: ExecProjectRow[];
  milestones: UpcomingMilestone[];
  topRisks: ExecTopRisk[];
  capacity: ExecCapacity[];
}

export async function getExecDashboard(ctx: TenantContext): Promise<ExecDashboard> {
  const [summary, priorities, milestones, workload, risks, notifications, live] = await Promise.all([
    getDashboardSummary(ctx),
    getBriefing(ctx, 4),
    getUpcomingMilestones(ctx, 6),
    listWorkload(ctx),
    listRisks(ctx, {}),
    listNotifications(ctx, 6),
    withTenant(ctx, async (tx) => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const now = new Date();
      const [projects, velocity7d, openMilestones] = await Promise.all([
        tx.project.findMany({
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            dueDate: true,
            orgStatuses: { select: { progress: true } },
            lead: { select: { name: true } },
          },
          orderBy: [{ status: "asc" }, { name: "asc" }],
        }),
        tx.projectTask.count({ where: { status: "Completed", approvalStatus: { not: "Draft" }, updatedAt: { gte: since } } }),
        tx.projectMilestone.findMany({ where: { status: { not: "Done" }, dueDate: { not: null } }, select: { dueDate: true } }),
      ]);
      const milestonesOverdue = openMilestones.filter((m) => m.dueDate && m.dueDate < now).length;
      return { projects, velocity7d, milestonesUpcoming: openMilestones.length - milestonesOverdue, milestonesOverdue };
    }),
  ]);

  // One health engine (M0): the same classification Q and every report use.
  const { total, onTrack, needAttention, planning, pct: healthPct } = portfolioHealth(
    live.projects.map((p) => p.status),
  );

  const openRisks = risks.filter((r) => r.status !== "Closed" && r.status !== "Mitigated");
  const overAllocated = workload.filter((w) => w.totalPct > 100);
  const peopleAllocated = workload.filter((w) => w.projectCount > 0).length;

  const projects: ExecProjectRow[] = live.projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.status,
    avgProgress: avgProgress({ orgStatuses: p.orgStatuses }),
    ownerName: p.lead?.name ?? null,
    dueDate: p.dueDate,
  }));

  const topRisks: ExecTopRisk[] = openRisks
    .map((r) => ({ id: r.id, title: r.title, heat: r.probability * r.impact, projectCode: r.projectCode }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 5);

  const capacity: ExecCapacity[] = workload
    .filter((w) => w.projectCount > 0)
    .sort((a, b) => b.totalPct - a.totalPct)
    .slice(0, 6)
    .map((w) => ({ userId: w.userId, name: w.name, totalPct: w.totalPct }));

  const kpis: ExecKpis = {
    projects: total,
    onTrack,
    needAttention,
    risksOpen: openRisks.length,
    milestonesUpcoming: live.milestonesUpcoming,
    milestonesOverdue: live.milestonesOverdue,
    velocity7d: live.velocity7d,
    healthPct,
    peopleAllocated,
    overAllocated: overAllocated.length,
    budget: summary.totalBudget,
  };

  return {
    priorities,
    health: { onTrack, needAttention, planning, total, pct: healthPct },
    notifications,
    kpis,
    projects,
    milestones,
    topRisks,
    capacity,
  };
}

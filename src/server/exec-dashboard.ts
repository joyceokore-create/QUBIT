import { withTenant, type TenantContext } from "@/lib/tenant";
import { getDashboardSummary, getUpcomingMilestones, avgProgress, type UpcomingMilestone } from "@/server/dashboard";
import { getBriefing, type BriefingItem } from "@/server/relevance";
import { listWorkload } from "@/server/resources";
import { listRisks } from "@/server/risks";
import { listNotifications, type NotificationRow } from "@/server/notifications";

// Data for the Phase A exec dashboard (PROMPT-personalized-dashboards + Joyce's layout). Every
// number is grounded in live tenant data — the aspirational bits (budget burn, confidence, AI
// prediction, trend history) are NOT here and render as "coming soon" placeholders in the UI,
// so nothing shown is fabricated. The exec brief + insights are DETERMINISTIC summaries of the
// same data (no per-load LLM); interactive AI stays in the Q drawer.

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

export interface ExecInsight {
  tone: "bad" | "warn" | "ok";
  text: string;
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
  brief: string[];
  priorities: BriefingItem[];
  health: { onTrack: number; needAttention: number; planning: number; total: number; pct: number };
  notifications: NotificationRow[];
  kpis: ExecKpis;
  projects: ExecProjectRow[];
  milestones: UpcomingMilestone[];
  topRisks: ExecTopRisk[];
  capacity: ExecCapacity[];
  insights: ExecInsight[];
  recommendations: ExecInsight[];
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

  const by = (s: string) => live.projects.filter((p) => p.status === s).length;
  const onTrack = by("OnTrack") + by("Completed");
  const needAttention = by("AtRisk") + by("Overdue");
  const planning = by("Planning") + by("Cancelled");
  const total = live.projects.length;
  const healthPct = total ? Math.round((onTrack / total) * 100) : 0;

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

  // Deterministic exec brief — grounded one-liners, no LLM.
  const brief = [
    `${total} ${total === 1 ? "project" : "projects"} in flight · ${healthPct}% portfolio health.`,
    needAttention > 0
      ? `${needAttention} ${needAttention === 1 ? "project needs" : "projects need"} attention (${by("Overdue")} overdue, ${by("AtRisk")} at risk).`
      : `Everything is tracking cleanly — nothing at risk or overdue.`,
    `${kpis.velocity7d} ${kpis.velocity7d === 1 ? "task" : "tasks"} completed in the last 7 days.`,
  ];

  // Deterministic insights + recommendations from live signals.
  const insights: ExecInsight[] = [];
  if (by("Overdue")) insights.push({ tone: "bad", text: `${by("Overdue")} project(s) overdue.` });
  if (kpis.milestonesOverdue) insights.push({ tone: "bad", text: `${kpis.milestonesOverdue} milestone(s) past due.` });
  if (openRisks.length) insights.push({ tone: "warn", text: `${openRisks.length} open risk(s); highest heat ${topRisks[0]?.heat ?? 0}/25.` });
  if (overAllocated.length) insights.push({ tone: "warn", text: `${overAllocated.length} person(s) over-allocated (>100%).` });
  if (insights.length === 0) insights.push({ tone: "ok", text: "No red flags across the portfolio right now." });

  const leadless = projects.filter((p) => !p.ownerName).length;
  const recommendations: ExecInsight[] = [];
  if (leadless) recommendations.push({ tone: "warn", text: `Assign a lead to ${leadless} project(s) with none.` });
  if (overAllocated.length) recommendations.push({ tone: "warn", text: `Rebalance ${overAllocated[0]?.name}'s ${overAllocated[0]?.totalPct}% allocation.` });
  if (kpis.milestonesOverdue) recommendations.push({ tone: "bad", text: `Re-baseline the ${kpis.milestonesOverdue} overdue milestone(s).` });
  if (recommendations.length === 0) recommendations.push({ tone: "ok", text: "No actions needed — keep the cadence." });

  return {
    brief,
    priorities,
    health: { onTrack, needAttention, planning, total, pct: healthPct },
    notifications,
    kpis,
    projects,
    milestones,
    topRisks,
    capacity,
    insights,
    recommendations,
  };
}

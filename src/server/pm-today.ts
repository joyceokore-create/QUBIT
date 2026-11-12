import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { dayKey } from "@/lib/dates";
import { startOfDayInZone } from "@/lib/list-query";
import { derivedRagReasons } from "@/server/health";
import { listWorkload } from "@/server/resources";
import { getTenantTimeZone } from "@/server/preferences";
import type { CockpitProject } from "@/server/dashboard-cockpit";
import { GATE_KEYS, GATE_LABELS } from "@/lib/cockpit-gates";
import type { PmToday, PmTodayProject } from "@/lib/pm-today";

/**
 * UX7 — PM › Today (UX plan D3/UX7). Everything across the projects the PM runs (lead, PM
 * member or instance lead — `pmIds`, the one ownership rule) that needs them. Project-shaped
 * facts come from the cockpit payload the page already loaded; this adds the PM's overdue and
 * upcoming milestones, this week's check-in state, open blockers raised by their team, and
 * people booked over 100% on their projects. All reads run under the tenant's RLS context.
 */
const DAY = 86_400_000;

export async function getPmToday(ctx: TenantContext, cockpit: CockpitProject[], now = new Date()): Promise<PmToday> {
  const mine = cockpit.filter((p) => p.pmIds.includes(ctx.userId) && !["Completed", "Cancelled"].includes(p.status));
  const ids = mine.map((p) => p.id);
  const timeZone = await getTenantTimeZone(ctx);
  const todayStart = startOfDayInZone(dayKey(now, timeZone), timeZone);
  const weekAhead = new Date(todayStart.getTime() + 8 * DAY);

  const [data, workload] = await Promise.all([
    ids.length
      ? withTenant(ctx, async (tx) => {
          const [overdue, upcoming, checkIns, blockers, members] = await Promise.all([
            tx.projectMilestone.findMany({
              where: { projectId: { in: ids }, status: { not: "Done" }, dueDate: { lt: todayStart } },
              select: { id: true, name: true, dueDate: true, projectId: true },
              orderBy: { dueDate: "asc" },
              take: 100,
            }),
            tx.projectMilestone.findMany({ where: { projectId: { in: ids }, status: { not: "Done" }, dueDate: { gte: todayStart, lt: weekAhead } }, select: { dueDate: true }, take: 500 }),
            tx.checkIn.findMany({
              where: { projectId: { in: ids }, isoWeek: isoWeekId(now) },
              select: { projectId: true, status: true, submittedToHeadAt: true },
            }),
            tx.blocker.findMany({
              where: { projectId: { in: ids }, status: "Open" },
              select: {
                id: true,
                description: true,
                dateRaised: true,
                projectId: true,
                taskId: true,
                task: { select: { title: true } },
                raisedBy: { select: { name: true } },
                owner: { select: { name: true } },
              },
              orderBy: { dateRaised: "asc" },
              take: 100,
            }),
            tx.projectMember.findMany({ where: { projectId: { in: ids } }, select: { userId: true } }),
          ]);
          return { overdue, upcoming, checkIns, blockers, members };
        })
      : Promise.resolve({ overdue: [], upcoming: [] as { dueDate: Date | null }[], checkIns: [], blockers: [], members: [] }),
    ids.length ? listWorkload(ctx, now).catch(() => []) : Promise.resolve([]),
  ]);

  const name = new Map(mine.map((p) => [p.id, p.name]));
  const checkIn = new Map(data.checkIns.map((c) => [c.projectId, c]));
  const onMine = new Set(data.members.map((m) => m.userId));

  const projects: PmTodayProject[] = mine.map((p) => {
    const c = checkIn.get(p.id);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      reported: p.reported,
      calculated: p.calculated,
      dispute: p.dispute,
      reasons: derivedRagReasons(p.signals),
      pct: p.pct,
      nextMilestone: p.nextMilestone ? { name: p.nextMilestone.name, dueDate: p.nextMilestone.dueDate } : null,
      update: c?.submittedToHeadAt ? "sent" : c?.status === "Confirmed" ? "confirmed" : c ? "draft" : "none",
      gates: GATE_KEYS.filter((k) => p.gates[k] === "block" || p.gates[k] === "late").map((k) => ({
        key: k,
        label: GATE_LABELS[k],
        state: p.gates[k] === "block" ? ("blocked" as const) : ("late" as const),
      })),
      redItems: p.risks.filter((r) => r.severity === "R").map((r) => ({ title: r.title, owner: r.owner })),
      overdueTasks: p.overdueTasks,
    };
  });

  return {
    timeZone,
    projects,
    overdueMilestones: data.overdue.map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate!, projectId: m.projectId, projectName: name.get(m.projectId) ?? "" })),
    milestonesNext7: data.upcoming.length,
    // KPI bars: milestones due on each of the next 7 tenant-local days (today first).
    milestonesNext7PerDay: Array.from({ length: 7 }, (_, i) => {
      const k = dayKey(new Date(now.getTime() + i * 86_400_000), timeZone);
      return data.upcoming.filter((m) => m.dueDate && dayKey(m.dueDate, timeZone) === k).length;
    }),
    blockers: data.blockers.map((b) => ({
      id: b.id,
      description: b.description,
      since: b.dateRaised,
      projectId: b.projectId,
      projectName: name.get(b.projectId) ?? "",
      taskId: b.taskId,
      taskTitle: b.task?.title ?? null,
      raisedBy: b.raisedBy?.name ?? null,
      unblocker: b.owner?.name ?? null,
    })),
    clashes: workload
      .filter((w) => w.totalPct > 100 && onMine.has(w.userId))
      .map((w) => ({ name: w.name, pct: w.totalPct, projects: w.allocations.map((a) => a.projectName) }))
      .sort((a, b) => b.pct - a.pct),
  };
}

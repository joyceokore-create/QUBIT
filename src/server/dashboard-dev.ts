import { withTenant, type TenantContext } from "@/lib/tenant";
import { weekWindow } from "@/lib/iso-week";
import { listMyTasks, type MyTaskRow } from "@/server/project-tasks";

/**
 * Developer preset data (docs/17 §4): "What do I work on right now?" — one focus task
 * (a decision made for them, not a list), queue buckets, my boards, and this week's
 * momentum. Largely re-homes the My Tasks queries as the landing view; /my-tasks stays
 * as the full page.
 */

export interface DevBuckets {
  overdue: MyTaskRow[];
  dueThisWeek: MyTaskRow[];
  inReview: MyTaskRow[];
  blocked: MyTaskRow[];
}

export interface DevBoard {
  projectId: string;
  code: string;
  name: string;
  openMine: number;
}

export interface DoneRow {
  id: string;
  title: string;
  projectCode: string;
  projectId: string;
}

export interface DevDashboard {
  focus: MyTaskRow | null;
  /** Why THIS task — the ranking is explained, never an unexplained pick. */
  focusReason: string;
  buckets: DevBuckets;
  boards: DevBoard[];
  doneThisWeek: DoneRow[];
}

/** §4 ranking: overdue (most first) > due soonest > awaiting review > freshest open.
 * Blocked tasks are never the focus — they aren't actionable by the assignee. Pure. */
export function rankFocus(tasks: MyTaskRow[], now: Date): { task: MyTaskRow; reason: string } | null {
  const open = tasks.filter((t) => t.status !== "Completed" && !t.blocked);
  if (open.length === 0) return null;

  const overdue = open
    .filter((t) => t.dueDate && t.dueDate < now)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  if (overdue[0]) {
    const days = Math.max(1, Math.floor((now.getTime() - overdue[0].dueDate!.getTime()) / 86_400_000));
    return { task: overdue[0], reason: `${days}d overdue — clear it first` };
  }

  const upcoming = open
    .filter((t) => t.dueDate && t.dueDate >= now)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
  if (upcoming[0]) return { task: upcoming[0], reason: "due soonest" };

  const inReview = open.filter((t) => t.status === "InReview" || t.status === "InQA");
  if (inReview[0]) return { task: inReview[0], reason: "awaiting review feedback" };

  const freshest = [...open].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return { task: freshest[0], reason: "top of your queue" };
}

export async function getDevDashboard(ctx: TenantContext, now = new Date()): Promise<DevDashboard> {
  const { start, end } = weekWindow(now);
  const [tasks, done, memberships] = await Promise.all([
    listMyTasks(ctx, ctx.userId),
    withTenant(ctx, (tx) =>
      tx.projectTask.findMany({
        where: { assigneeId: ctx.userId, approvalStatus: { not: "Draft" }, status: "Completed", updatedAt: { gte: start } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, title: true, projectId: true, project: { select: { code: true } } },
      }),
    ),
    withTenant(ctx, (tx) =>
      tx.projectMember.findMany({
        where: { userId: ctx.userId, project: { status: { notIn: ["Completed", "Cancelled"] } } },
        select: { project: { select: { id: true, code: true, name: true } } },
      }),
    ),
  ]);

  const open = tasks.filter((t) => t.status !== "Completed");
  const buckets: DevBuckets = {
    overdue: open.filter((t) => t.dueDate && t.dueDate < now),
    dueThisWeek: open.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate < end),
    inReview: open.filter((t) => t.status === "InReview" || t.status === "InQA"),
    blocked: open.filter((t) => t.blocked),
  };

  const openByProject = new Map<string, number>();
  for (const t of open) openByProject.set(t.projectId, (openByProject.get(t.projectId) ?? 0) + 1);

  const focus = rankFocus(tasks, now);
  return {
    focus: focus?.task ?? null,
    focusReason: focus?.reason ?? "",
    buckets,
    boards: memberships
      .map((m) => ({
        projectId: m.project.id,
        code: m.project.code,
        name: m.project.name,
        openMine: openByProject.get(m.project.id) ?? 0,
      }))
      .sort((a, b) => b.openMine - a.openMine),
    doneThisWeek: done.map((d) => ({ id: d.id, title: d.title, projectCode: d.project.code, projectId: d.projectId })),
  };
}

import "server-only";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { PM_SELECT, pmIdsOf } from "@/lib/ownership";
import { weekWindow } from "@/lib/iso-week";
import { projectRoleCategory } from "@/lib/roles";
import { checkinSummaryByProject } from "@/server/checkins";
import { getTenantTimeZone } from "@/server/preferences";
import type { MyBlocker, MyProject, MyTask, MyWork } from "@/lib/my-work";

/**
 * UX6 — Member › My work (UX plan UX6). Tasks ASSIGNED to the person (the old "My work"
 * looked for projects they lead, so it was usually empty), their blockers and their projects,
 * all under the tenant's RLS context. Tasks are mirrored from YouTrack: QUBIT matches the
 * YouTrack assignee by email, and tasks whose assignee didn't match carry only a display name
 * (`externalAssigneeName`) — counted here so the page can say so honestly.
 */

const ACTIVE = { status: { notIn: ["Completed", "Cancelled"] } };
const ROLE_LABEL: Record<string, string> = { PM: "Project Manager", Dev: "Developer", QA: "QA", Implementor: "Implementor", Stakeholder: "Stakeholder" };

export async function getMyWork(ctx: TenantContext, now = new Date()): Promise<MyWork> {
  const thisWeek = weekWindow(now);
  const lastWeek = weekWindow(new Date(thisWeek.start.getTime() - 86_400_000));
  const [timeZone, checkins, data] = await Promise.all([
    getTenantTimeZone(ctx),
    checkinSummaryByProject(ctx, now),
    withTenant(ctx, async (tx) => {
      const [memberships, led, openTasks, raisedBugs, doneThis, doneLast, raisedBlockers] = await Promise.all([
        tx.projectMember.findMany({ where: { userId: ctx.userId, project: ACTIVE }, select: { projectId: true, role: true } }),
        tx.project.findMany({ where: { leadUserId: ctx.userId, ...ACTIVE }, select: { id: true } }),
        tx.projectTask.findMany({
          where: { assigneeId: ctx.userId, approvalStatus: "Published", status: { not: "Completed" }, project: ACTIVE },
          select: TASK_SELECT,
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { title: "asc" }],
          take: 300,
        }),
        // QA: bugs this person reported that are still open (the "Issues I raised" tab).
        tx.projectTask.findMany({
          where: { reporterId: ctx.userId, type: "Bug", approvalStatus: "Published", status: { not: "Completed" }, project: ACTIVE, NOT: { assigneeId: ctx.userId } },
          select: TASK_SELECT,
          orderBy: [{ updatedAt: "desc" }],
          take: 100,
        }),
        // Done = Completed with its last activity in the week (the rule checkins.ts uses for
        // synced tasks, whose lastActivityAt is the tracker's updatedAt).
        tx.projectTask.count({ where: { assigneeId: ctx.userId, status: "Completed", lastActivityAt: { gte: thisWeek.start, lt: thisWeek.end } } }),
        tx.projectTask.count({ where: { assigneeId: ctx.userId, status: "Completed", lastActivityAt: { gte: lastWeek.start, lt: lastWeek.end } } }),
        tx.blocker.findMany({
          where: { status: "Open", raisedById: ctx.userId },
          select: BLOCKER_SELECT,
          orderBy: { dateRaised: "asc" },
          take: 50,
        }),
      ]);

      const projectIds = [...new Set([...memberships.map((m) => m.projectId), ...led.map((p) => p.id), ...openTasks.map((t) => t.projectId)])];
      const [projects, unmatched, people] = await Promise.all([
        tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, name: true, ...PM_SELECT }, orderBy: { name: "asc" } }),
        tx.projectTask.findMany({
          where: { projectId: { in: projectIds }, assigneeId: null, externalAssigneeName: { not: null }, status: { not: "Completed" }, approvalStatus: "Published" },
          select: { externalAssigneeName: true },
        }),
        // Everyone on these projects — the "Who can unblock it?" choices.
        tx.projectMember.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, role: true, user: { select: { id: true, name: true } } } }),
      ]);
      const leadIds = projects.flatMap((p) => pmIdsOf(p));
      const leads = leadIds.length ? await tx.user.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } }) : [];
      return { memberships, led, openTasks, raisedBugs, doneThis, doneLast, raisedBlockers, projects, unmatched, people, leads };
    }),
  ]);

  const roleByProject = new Map<string, string>();
  for (const p of data.led) roleByProject.set(p.id, "Project Lead");
  for (const m of data.memberships) roleByProject.set(m.projectId, m.role);
  const roleLabel = (projectId: string) => {
    const raw = roleByProject.get(projectId);
    if (!raw) return null;
    return raw === "Project Lead" ? raw : (ROLE_LABEL[projectRoleCategory(raw)] ?? raw);
  };
  const leadName = new Map(data.leads.map((u) => [u.id, u.name]));

  const toTask = (t: TaskRow, raisedByMe: boolean): MyTask => {
    const b = t.blockers[0];
    return {
      id: t.id,
      title: t.title,
      key: t.externalKey ?? t.taskKey,
      projectId: t.projectId,
      projectName: t.project.name,
      status: t.status,
      type: t.type,
      priority: t.priority,
      severity: t.severity,
      dueDate: t.dueDate,
      estimate: t.estimate,
      description: t.description,
      milestone: t.milestone?.name ?? null,
      externalUrl: t.externalUrl,
      role: roleLabel(t.projectId),
      raisedByMe,
      blocker: b ? { id: b.id, description: b.description, since: b.dateRaised, unblocker: b.owner?.name ?? null } : null,
    };
  };

  const tasks = data.openTasks.map((t) => toTask(t, false));
  const raised = data.raisedBugs.map((t) => toTask(t, true));

  // Your blockers: those on your tasks, plus any you raised elsewhere.
  const blockers = new Map<string, MyBlocker>();
  for (const t of tasks) {
    if (t.blocker) blockers.set(t.blocker.id, { ...t.blocker, taskId: t.id, taskTitle: t.title, projectId: t.projectId, projectName: t.projectName });
  }
  for (const b of data.raisedBlockers) {
    if (!blockers.has(b.id)) {
      blockers.set(b.id, {
        id: b.id,
        description: b.description,
        since: b.dateRaised,
        unblocker: b.owner?.name ?? null,
        taskId: b.task?.id ?? null,
        taskTitle: b.task?.title ?? null,
        projectId: b.projectId,
        projectName: b.project.name,
      });
    }
  }

  const peopleByProject = new Map<string, Map<string, string>>();
  for (const p of data.projects) {
    const m = new Map<string, string>();
    for (const id of pmIdsOf(p)) m.set(id, `${leadName.get(id) ?? "Project lead"} (PM)`);
    peopleByProject.set(p.id, m);
  }
  for (const pm of data.people) {
    const m = peopleByProject.get(pm.projectId);
    if (m && !m.has(pm.user.id)) m.set(pm.user.id, `${pm.user.name} (${pm.role})`);
  }

  const projects: MyProject[] = data.projects.map((p) => {
    const c = checkins.get(p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      role: roleLabel(p.id),
      openTasks: tasks.filter((t) => t.projectId === p.id).length,
      health: c?.confirmed ? c.rag : null,
      pmNames: pmIdsOf(p).map((id) => leadName.get(id)).filter((n): n is string => !!n),
      people: [...(peopleByProject.get(p.id) ?? new Map()).entries()]
        .filter(([id]) => id !== ctx.userId)
        .map(([id, label]) => ({ id, label })),
    };
  });

  const unmatchedNames = [...new Set(data.unmatched.map((u) => u.externalAssigneeName).filter((n): n is string => !!n))].sort();
  return {
    timeZone,
    tasks,
    raised,
    blockers: [...blockers.values()].sort((a, b) => a.since.getTime() - b.since.getTime()),
    projects,
    done: { thisWeek: data.doneThis, lastWeek: data.doneLast },
    unmatched: { count: data.unmatched.length, names: unmatchedNames.slice(0, 5) },
  };
}

const TASK_SELECT = {
  id: true,
  title: true,
  taskKey: true,
  externalKey: true,
  externalUrl: true,
  projectId: true,
  status: true,
  type: true,
  priority: true,
  severity: true,
  dueDate: true,
  estimate: true,
  description: true,
  project: { select: { name: true } },
  milestone: { select: { name: true } },
  blockers: {
    where: { status: "Open" },
    orderBy: { dateRaised: "asc" as const },
    take: 1,
    select: { id: true, description: true, dateRaised: true, owner: { select: { name: true } } },
  },
} as const;

type TaskRow = {
  id: string;
  title: string;
  taskKey: string | null;
  externalKey: string | null;
  externalUrl: string | null;
  projectId: string;
  status: string;
  type: string;
  priority: string;
  severity: string | null;
  dueDate: Date | null;
  estimate: string | null;
  description: string | null;
  project: { name: string };
  milestone: { name: string } | null;
  blockers: { id: string; description: string; dateRaised: Date; owner: { name: string } | null }[];
};

const BLOCKER_SELECT = {
  id: true,
  description: true,
  dateRaised: true,
  projectId: true,
  project: { select: { name: true } },
  task: { select: { id: true, title: true } },
  owner: { select: { name: true } },
} as const;

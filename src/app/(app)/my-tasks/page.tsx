import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listMyTasks, listManagedTasks, listTasksInTestPhase, type MyTaskRow } from "@/server/project-tasks";
import { Forbidden } from "@/components/forbidden";
import { MyTasksClient } from "./my-tasks-client";

// PRD Member view (QUBIT App v3) — the signed-in user's assigned tasks: a focus queue of the
// three most-urgent, then buckets (Overdue · Due this week · Blocked · Open · Recently
// completed). Role-aware extras (§6): a ProjectManager also sees tasks across their projects,
// and HeadOfQA sees what's in test. Toggling a task marks it complete via PATCH /api/tasks/[id].

const toClient = (t: MyTaskRow) => ({
  id: t.id,
  title: t.title,
  projectId: t.projectId,
  projectCode: t.projectCode,
  status: t.status,
  priority: t.priority,
  blocked: t.blocked,
  dueDate: t.dueDate ? t.dueDate.toISOString() : null,
  updatedAt: t.updatedAt.toISOString(),
});

export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const roles = session.user.roles;
  const isManager = roles.includes("ProjectManager") || roles.includes("HeadOfProjects");
  const isQa = roles.includes("HeadOfQA");

  const [tasks, managed, inTest] = await Promise.all([
    listMyTasks(ctx, ctx.userId),
    isManager ? listManagedTasks(ctx, ctx.userId) : Promise.resolve([] as MyTaskRow[]),
    isQa ? listTasksInTestPhase(ctx) : Promise.resolve([] as MyTaskRow[]),
  ]);

  return (
    <MyTasksClient
      name={session.user.name ?? "You"}
      roles={roles}
      tasks={tasks.map(toClient)}
      managed={managed.map(toClient)}
      inTest={inTest.map(toClient)}
    />
  );
}

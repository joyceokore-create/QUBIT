import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listMyTasks } from "@/server/project-tasks";
import { Forbidden } from "@/components/forbidden";
import { MyTasksClient } from "./my-tasks-client";

// PRD Member view (QUBIT App v3) — the signed-in user's assigned tasks: a focus queue of the
// three most-urgent, then buckets (Overdue · Due this week · Open · Recently completed).
// Toggling a task marks it complete via PATCH /api/tasks/[id].
export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  if (!can(ctx, "dashboard:read")) return <Forbidden />;

  const tasks = await listMyTasks(ctx, ctx.userId);

  return (
    <MyTasksClient
      name={session.user.name ?? "You"}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        projectId: t.projectId,
        projectCode: t.projectCode,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}

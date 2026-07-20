import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { canViewProject } from "@/lib/project-access";
import { canContributeToProject } from "@/lib/access";
import { withTenant } from "@/lib/tenant";
import { getProjectPanelData } from "@/server/projects";
import { listProjectMembers } from "@/server/resources";
import { Forbidden } from "@/components/forbidden";
import { ProjectWorkspace } from "@/components/workspace/project-workspace";
import type { ProjectPanelJson } from "@/components/panels/project-panel-content";

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id, roles: session.user.roles, permissions: session.user.permissions };
  const { id } = await params;

  if (!(await canViewProject(ctx, id))) return <Forbidden />;

  const [p, members, canContribute, isMember] = await Promise.all([
    getProjectPanelData(ctx, id),
    listProjectMembers(ctx, id),
    canContributeToProject(ctx, id),
    withTenant(ctx, async (tx) => {
      const [lead, m] = await Promise.all([
        tx.project.findFirst({ where: { id, leadUserId: ctx.userId }, select: { id: true } }),
        tx.projectMember.findFirst({ where: { projectId: id, userId: ctx.userId }, select: { id: true } }),
      ]);
      return Boolean(lead || m);
    }),
  ]);
  if (!p) notFound();

  const data: ProjectPanelJson = {
    ...p,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    canEdit: can(ctx, "project:update"), // project settings / team
    canContribute, // tasks + blockers: any project member
    isMember, // viewer leads or is allocated → hides the "Request to join" button
  };

  return (
    <ProjectWorkspace data={data} members={members.map((m) => ({ name: m.name }))} />
  );
}

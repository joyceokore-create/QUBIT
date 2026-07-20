import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { canViewProject } from "@/lib/project-access";
import { canContributeToProject, canWriteProject } from "@/lib/access";
import { projectRoleCategory, type ProjectRoleCategory } from "@/lib/roles";
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

  const [p, members, canContribute, canPublish, membership] = await Promise.all([
    getProjectPanelData(ctx, id),
    listProjectMembers(ctx, id),
    canContributeToProject(ctx, id),
    canWriteProject(ctx, id), // plan publishing + join-request decisions (PM-level)
    withTenant(ctx, async (tx) => {
      const [lead, m] = await Promise.all([
        tx.project.findFirst({ where: { id, leadUserId: ctx.userId }, select: { id: true } }),
        tx.projectMember.findFirst({ where: { projectId: id, userId: ctx.userId }, select: { id: true, role: true } }),
      ]);
      return { isMember: Boolean(lead || m), isLead: Boolean(lead), memberRole: m?.role ?? null };
    }),
  ]);
  if (!p) notFound();

  // The board lens the viewer lands on: PM for anyone with publish authority or the lead,
  // else their membership role's category (Dev / QA / Stakeholder → the "all" lens).
  const viewerCategory: ProjectRoleCategory =
    canPublish || membership.isLead
      ? "PM"
      : membership.memberRole
        ? projectRoleCategory(membership.memberRole)
        : "Stakeholder";

  const data: ProjectPanelJson = {
    ...p,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    startDate: p.startDate ? p.startDate.toISOString() : null,
    canEdit: can(ctx, "project:update"), // project settings / team
    canContribute, // tasks + blockers: any project member
    canPublish, // plan approval (Draft → Published) — PM-level (DM1.15 №3)
    viewerCategory,
    isMember: membership.isMember, // viewer leads or is allocated → hides "Request to join"
  };

  return (
    <ProjectWorkspace data={data} members={members.map((m) => ({ name: m.name }))} />
  );
}

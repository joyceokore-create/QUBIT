import { withTenant, type TenantContext } from "@/lib/tenant";
import { canWriteProject } from "@/lib/access";
import { projectRoleCategory, type ProjectRoleCategory } from "@/lib/roles";

/**
 * DM1.43 — who is this viewer ON THIS PROJECT? One computation, used by both the
 * workspace page and the tasks API, so the category the UI renders toggles for and the
 * category the server filters by can never disagree. A rule enforced only in the client
 * is not a rule.
 *
 * PM = anyone with project-write authority (lead, tenant PM roles, super-admin) — they
 * see the whole board and every lens. Otherwise the viewer's project-membership role
 * decides their lane; a non-member (or an uncategorised role) is a Stakeholder:
 * read-only, whole picture.
 */
export async function viewerBoardCategory(ctx: TenantContext, projectId: string): Promise<ProjectRoleCategory> {
  if (await canWriteProject(ctx, projectId)) return "PM";
  const membership = await withTenant(ctx, (tx) =>
    tx.projectMember.findFirst({ where: { projectId, userId: ctx.userId }, select: { role: true } }),
  );
  if (!membership) return "Stakeholder";
  return projectRoleCategory(membership.role);
}

/**
 * userId → project-role category for every member of a project (the lead counts as PM
 * whatever their membership row says). Feeds `assigneeCategory` on board rows, which is
 * what decides a task's lane (docs: board-lens.ts laneFor).
 */
export async function memberCategoryByUser(
  ctx: TenantContext,
  projectId: string,
): Promise<Map<string, ProjectRoleCategory>> {
  return withTenant(ctx, async (tx) => {
    const [members, project] = await Promise.all([
      tx.projectMember.findMany({ where: { projectId }, select: { userId: true, role: true } }),
      tx.project.findUnique({ where: { id: projectId }, select: { leadUserId: true } }),
    ]);
    const out = new Map<string, ProjectRoleCategory>();
    for (const m of members) out.set(m.userId, projectRoleCategory(m.role));
    if (project?.leadUserId) out.set(project.leadUserId, "PM");
    return out;
  });
}

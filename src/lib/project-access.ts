import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";

/**
 * Workspace access: a project's own members (allocated people or its lead) can VIEW it,
 * even without the tenant-wide `project:read` role. Editing still requires `project:update`.
 * This is what lets a Member open their project workspace.
 */
export async function canViewProject(ctx: TenantContext, projectId: string): Promise<boolean> {
  if (can(ctx, "project:read")) return true;
  return withTenant(ctx, async (tx) => {
    const [member, lead] = await Promise.all([
      tx.projectMember.findFirst({ where: { projectId, userId: ctx.userId }, select: { userId: true } }),
      tx.project.findFirst({ where: { id: projectId, leadUserId: ctx.userId }, select: { id: true } }),
    ]);
    return Boolean(member || lead);
  });
}

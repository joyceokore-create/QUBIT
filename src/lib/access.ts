// Resource-scoped access helpers (PROMPT §2). These layer ON TOP of the role-level
// `can()` in src/lib/rbac.ts: a role denied at the role level may still be granted for a
// specific resource it owns, leads, or is a PM-member of. Every lookup runs under RLS via
// withTenant, and the scope (project/person/team/department) is always derived from the
// session + DB — NEVER from a client-supplied role or id claim.
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import { withTenant, type TenantContext } from "@/lib/tenant";

type Tx = Prisma.TransactionClient;

// ProjectMember.role values (free-text, from PROJECT_ROLES) that carry delivery-write
// authority on their project — alongside the project's lead (Project.leadUserId). Kept
// deliberately narrow: a "PM-role member" is the project's manager, not any allocated person.
const PROJECT_WRITE_ROLES = ["Project Manager"];

const HEAD_ROLES = ["HeadOfProjects", "HeadOfQA"];

/** Task phases HeadOfQA may edit the status of (PROMPT §2: task:write on Testing/UAT). */
function isQaPhase(phase: string | null | undefined): boolean {
  return !!phase && /\b(uat|sit|test)/i.test(phase);
}

/** True if `userId` leads `projectId` or holds a PM-type role on it. Runs inside a tx. */
async function isDeliveryOwnerTx(tx: Tx, userId: string, projectId: string): Promise<boolean> {
  const [lead, member] = await Promise.all([
    tx.project.findFirst({ where: { id: projectId, leadUserId: userId }, select: { id: true } }),
    tx.projectMember.findFirst({
      where: { projectId, userId, role: { in: PROJECT_WRITE_ROLES } },
      select: { id: true },
    }),
  ]);
  return Boolean(lead || member);
}

/** True if `userId` is a MEMBER of `projectId` — its lead OR any allocated member (any role).
 * "Part of the project": risks/tasks may be written by anyone on the project (per Joyce). */
async function isProjectMemberTx(tx: Tx, userId: string, projectId: string): Promise<boolean> {
  const [lead, member] = await Promise.all([
    tx.project.findFirst({ where: { id: projectId, leadUserId: userId }, select: { id: true } }),
    tx.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } }),
  ]);
  return Boolean(lead || member);
}

/** Can the viewer edit this project (fields, dates, members, milestones)? PROMPT §2 project:write. */
export async function canWriteProject(ctx: TenantContext, projectId: string): Promise<boolean> {
  if (can(ctx, "project:write")) return true; // PlatformSuperAdmin, HeadOfProjects
  return withTenant(ctx, (tx) => isDeliveryOwnerTx(tx, ctx.userId, projectId));
}

/** Can the viewer see budget figures? Hidden from Members; PM sees only their own project. */
export async function canReadBudget(ctx: TenantContext, projectId?: string): Promise<boolean> {
  if (can(ctx, "budget:read")) return true; // PlatformSuperAdmin, Executive, both heads
  if (!projectId) return false; // no project context → Members/PMs see nothing tenant-wide
  return withTenant(ctx, (tx) => isDeliveryOwnerTx(tx, ctx.userId, projectId));
}

/** Can the viewer write this risk/blocker? A management role, the owner, or any member of the
 * project (the only block is a project you're not part of — per Joyce). */
export async function canWriteRiskOrBlocker(
  ctx: TenantContext,
  opts: { projectId?: string | null; ownerId?: string | null },
): Promise<boolean> {
  if (can(ctx, "risk:write")) return true; // ProjectManager, both heads, SuperAdmin
  if (opts.ownerId && opts.ownerId === ctx.userId) return true; // the owner writes their own
  if (!opts.projectId) return false;
  return withTenant(ctx, (tx) => isProjectMemberTx(tx, ctx.userId, opts.projectId!));
}

/** Can the viewer write this task? Full authority for lead/PM/roles; assignee for their own;
 * HeadOfQA for status of tasks in Testing/UAT. */
export async function canWriteTask(ctx: TenantContext, taskId: string): Promise<boolean> {
  if (can(ctx, "task:write")) return true; // PlatformSuperAdmin, HeadOfProjects, ProjectManager
  return withTenant(ctx, async (tx) => {
    const task = await tx.projectTask.findUnique({
      where: { id: taskId },
      select: { assigneeId: true, phase: true, projectId: true },
    });
    if (!task) return false;
    if (task.assigneeId === ctx.userId) return true; // assignee: status/progress/comments
    if (ctx.roles.includes("HeadOfQA") && isQaPhase(task.phase)) return true;
    return isProjectMemberTx(tx, ctx.userId, task.projectId); // any member of the project
  });
}

/** Can the viewer create/write risks/tasks/blockers WITHIN this project? A management role
 * (task/risk write) OR a member of the project. Used by the create routes — the only block is
 * a project you're not part of. */
export async function canContributeToProject(ctx: TenantContext, projectId: string): Promise<boolean> {
  if (can(ctx, "task:write") || can(ctx, "risk:write")) return true; // mgmt roles (PM/heads/SuperAdmin)
  return withTenant(ctx, (tx) => isProjectMemberTx(tx, ctx.userId, projectId));
}

/** Resolve a risk by id and decide write access (management role, owner, or project member). */
export async function canWriteRisk(ctx: TenantContext, riskId: string): Promise<boolean> {
  if (can(ctx, "risk:write")) return true;
  return withTenant(ctx, async (tx) => {
    const risk = await tx.risk.findUnique({ where: { id: riskId }, select: { projectId: true, ownerId: true } });
    if (!risk) return false;
    if (risk.ownerId === ctx.userId) return true;
    if (!risk.projectId) return false;
    return isProjectMemberTx(tx, ctx.userId, risk.projectId);
  });
}

/** Resolve a blocker by id and decide write access (management role, owner, or project member). */
export async function canWriteBlocker(ctx: TenantContext, blockerId: string): Promise<boolean> {
  if (can(ctx, "risk:write")) return true;
  return withTenant(ctx, async (tx) => {
    const b = await tx.blocker.findUnique({ where: { id: blockerId }, select: { projectId: true, ownerId: true } });
    if (!b) return false;
    if (b.ownerId === ctx.userId) return true;
    return isProjectMemberTx(tx, ctx.userId, b.projectId);
  });
}

/** Can the viewer run a workload report about `targetUserId`? Self always; SuperAdmin/
 * Executive/heads about anyone; PM only about members of a project they lead/PM. */
export async function canReportOnPerson(ctx: TenantContext, targetUserId?: string): Promise<boolean> {
  if (!targetUserId || targetUserId === ctx.userId) return true; // self
  if (can(ctx, "report:resource:others")) return true; // SuperAdmin, Executive, both heads
  return withTenant(ctx, async (tx) => {
    const [led, pmMemberships] = await Promise.all([
      tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
      tx.projectMember.findMany({
        where: { userId: ctx.userId, role: { in: PROJECT_WRITE_ROLES } },
        select: { projectId: true },
      }),
    ]);
    const projectIds = [...new Set([...led.map((p) => p.id), ...pmMemberships.map((m) => m.projectId)])];
    if (projectIds.length === 0) return false;
    const shared = await tx.projectMember.findFirst({
      where: { userId: targetUserId, projectId: { in: projectIds } },
      select: { id: true },
    });
    return Boolean(shared);
  });
}

/**
 * The set of users the viewer may see person-level data for (Q workload/person queries, §7):
 * "all" for SuperAdmin / Executive / heads (report:resource:others); otherwise themselves plus
 * members of any project they lead or PM. Q gates its person tools on this so a Member can't
 * extract another person's workload — enforced at the tool layer, not just the prompt.
 */
export async function reportableUserIds(ctx: TenantContext): Promise<"all" | Set<string>> {
  if (can(ctx, "report:resource:others")) return "all";
  return withTenant(ctx, async (tx) => {
    const [led, pmMemberships] = await Promise.all([
      tx.project.findMany({ where: { leadUserId: ctx.userId }, select: { id: true } }),
      tx.projectMember.findMany({
        where: { userId: ctx.userId, role: { in: PROJECT_WRITE_ROLES } },
        select: { projectId: true },
      }),
    ]);
    const projectIds = [...new Set([...led.map((p) => p.id), ...pmMemberships.map((m) => m.projectId)])];
    const ids = new Set<string>([ctx.userId]); // always themselves
    if (projectIds.length) {
      const members = await tx.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        select: { userId: true },
      });
      for (const m of members) ids.add(m.userId);
    }
    return ids;
  });
}

/** Can the viewer manage this team (rename, membership, set lead)? Team lead, heads, SuperAdmin. */
export async function canManageTeam(ctx: TenantContext, teamId: string): Promise<boolean> {
  if (can(ctx, "teams:manage:all")) return true; // SuperAdmin, both heads
  return withTenant(ctx, async (tx) => {
    const team = await tx.team.findFirst({ where: { id: teamId, leadUserId: ctx.userId }, select: { id: true } });
    return Boolean(team);
  });
}

/** Can the viewer manage this department? SuperAdmin (any); a head only for the department
 * they are the headUserId of (PROMPT §2 departments:manage). */
export async function canManageDepartment(ctx: TenantContext, departmentId: string): Promise<boolean> {
  if (ctx.roles.includes("PlatformSuperAdmin")) return true;
  if (!HEAD_ROLES.some((r) => ctx.roles.includes(r))) return false;
  return withTenant(ctx, async (tx) => {
    const dept = await tx.department.findFirst({
      where: { id: departmentId, headUserId: ctx.userId },
      select: { id: true },
    });
    return Boolean(dept);
  });
}

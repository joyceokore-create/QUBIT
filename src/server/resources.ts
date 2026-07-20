import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { PROJECT_ROLES } from "@/lib/roles";

/**
 * Resource allocation (MVP1): people assigned to projects (ProjectMember, with role
 * + allocation %) and whole teams assigned to projects (ProjectTeam). Powers the
 * project panel's resources section and the Q copilot's project/resource reports.
 */

export const SetProjectMemberInput = z.object({
  // Canonical project roles only (Phase 6.1, DM1.15 №1) — the delivery workflow keys off
  // projectRoleCategory(role), so free-text here would silently demote people to Stakeholder.
  role: z.enum(PROJECT_ROLES),
  allocationPct: z.number().int().min(0).max(100).nullable().optional(),
});
export type SetProjectMemberInput = z.infer<typeof SetProjectMemberInput>;

export interface ProjectMemberRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  allocationPct: number | null;
}

export interface UserAllocationRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  role: string;
  allocationPct: number | null;
}

export async function listProjectMembers(ctx: TenantContext, projectId: string): Promise<ProjectMemberRow[]> {
  return withTenant(ctx, async (tx) => {
    const members = await tx.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      allocationPct: m.allocationPct,
    }));
  });
}

/** Assign or update a person's allocation on a project (upsert). */
export async function setProjectMember(
  ctx: TenantContext,
  projectId: string,
  userId: string,
  input: SetProjectMemberInput,
) {
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const member = await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: {
        tenantId: ctx.tenantId,
        projectId,
        userId,
        role: input.role,
        allocationPct: input.allocationPct ?? null,
      },
      update: { role: input.role, allocationPct: input.allocationPct ?? null },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_member",
      entityId: `${projectId}:${userId}`,
      before: null,
      after: { role: member.role, allocationPct: member.allocationPct },
    });
    return member;
  });
}

export async function removeProjectMember(ctx: TenantContext, projectId: string, userId: string) {
  return withTenant(ctx, async (tx) => {
    await tx.projectMember.deleteMany({ where: { projectId, userId } });
    await audit(tx, ctx, {
      action: "delete",
      entityType: "project_member",
      entityId: `${projectId}:${userId}`,
      before: { userId },
      after: null,
    });
    return { projectId, userId };
  });
}

/** Replace the set of teams assigned to a project. */
export async function setProjectTeams(ctx: TenantContext, projectId: string, teamIds: string[]) {
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    await tx.projectTeam.deleteMany({ where: { projectId } });
    if (teamIds.length) {
      await tx.projectTeam.createMany({
        data: teamIds.map((teamId) => ({ tenantId: ctx.tenantId, projectId, teamId })),
        skipDuplicates: true,
      });
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_teams",
      entityId: projectId,
      before: null,
      after: { teamIds },
    });
    return { projectId, teamIds };
  });
}

export async function listProjectTeams(ctx: TenantContext, projectId: string) {
  return withTenant(ctx, (tx) =>
    tx.projectTeam
      .findMany({ where: { projectId }, include: { team: { select: { id: true, name: true } } } })
      .then((rows) => rows.map((r) => ({ teamId: r.team.id, name: r.team.name }))),
  );
}

export interface WorkloadRow {
  userId: string;
  name: string;
  email: string;
  departmentName: string | null;
  projectCount: number;
  totalPct: number;
  allocations: { projectCode: string; projectName: string; role: string; allocationPct: number | null }[];
}

/** All people with their project allocations — powers the /people workload view. */
export async function listWorkload(ctx: TenantContext): Promise<WorkloadRow[]> {
  return withTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({
      where: { status: { not: "DELETED" } },
      include: {
        department: { select: { name: true } },
        projectAllocations: { include: { project: { select: { code: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      departmentName: u.department?.name ?? null,
      projectCount: u.projectAllocations.length,
      totalPct: u.projectAllocations.reduce((n, a) => n + (a.allocationPct ?? 0), 0),
      allocations: u.projectAllocations.map((a) => ({
        projectCode: a.project.code,
        projectName: a.project.name,
        role: a.role,
        allocationPct: a.allocationPct,
      })),
    }));
  });
}

/** A person's allocations across projects — feeds the resource/workload report. */
export async function listUserAllocations(ctx: TenantContext, userId: string): Promise<UserAllocationRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectMember.findMany({
      where: { userId },
      include: { project: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      projectId: r.project.id,
      projectCode: r.project.code,
      projectName: r.project.name,
      role: r.role,
      allocationPct: r.allocationPct,
    }));
  });
}

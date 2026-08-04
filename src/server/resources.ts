import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { availabilityFactor } from "@/server/absence";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";
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
  // M-P1d (docs/26 §4.3): an assignment has a window. Omitted = untouched on update.
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
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
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      },
      update: {
        role: input.role,
        allocationPct: input.allocationPct ?? null,
        ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
      },
    });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_member",
      entityId: `${projectId}:${userId}`,
      before: null,
      after: { role: member.role, allocationPct: member.allocationPct, startDate: member.startDate, endDate: member.endDate },
    });
    return member;
  });
}

/** M-P1d — bulk assignment (docs/26 §4.3): several people onto one project in ONE
 * transaction, each with a role hat + allocation + window. Every add is audited and the
 * assignee notified; capacity warnings the assigner accepted ride in the audit blob. */
export const BulkAddMembersInput = z.object({
  members: z
    .array(
      SetProjectMemberInput.extend({ userId: z.string().uuid() }),
    )
    .min(1)
    .max(20),
  acceptedWarnings: z.array(z.string().max(200)).max(20).default([]),
});
export type BulkAddMembersInputT = z.infer<typeof BulkAddMembersInput>;

export async function addProjectMembers(ctx: TenantContext, projectId: string, input: BulkAddMembersInputT) {
  return withTenant(ctx, async (tx) => {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, code: true, name: true },
    });
    const ids = input.members.map((m) => m.userId);
    const found = await tx.user.count({ where: { id: { in: ids }, status: { not: "DELETED" } } });
    if (found !== new Set(ids).size) throw new Error("Unknown team member.");
    for (const m of input.members) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: m.userId } },
        create: {
          tenantId: ctx.tenantId,
          projectId,
          userId: m.userId,
          role: m.role,
          allocationPct: m.allocationPct ?? null,
          startDate: m.startDate ? new Date(m.startDate) : null,
          endDate: m.endDate ? new Date(m.endDate) : null,
        },
        update: {
          role: m.role,
          allocationPct: m.allocationPct ?? null,
          ...(m.startDate !== undefined ? { startDate: m.startDate ? new Date(m.startDate) : null } : {}),
          ...(m.endDate !== undefined ? { endDate: m.endDate ? new Date(m.endDate) : null } : {}),
        },
      });
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "project",
      entityId: projectId,
      after: {
        assigned: input.members.map((m) => ({ userId: m.userId, role: m.role, allocationPct: m.allocationPct ?? null })),
        acceptedWarnings: input.acceptedWarnings,
      },
    });
    await emitDomainEvent(tx, ctx, {
      type: "project.members_assigned",
      entityType: "project",
      entityId: projectId,
      payload: { count: input.members.length },
      notify: input.members
        .filter((m) => m.userId !== ctx.userId)
        .map((m) => ({
          userId: m.userId,
          kind: "project.assigned",
          message: `You were assigned to ${project.name} as ${m.role}${m.allocationPct ? ` (${m.allocationPct}%)` : ""}.`,
          link: `/projects/${projectId}`,
        })),
    });
    return { count: input.members.length };
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
  /** Allocation as typed — what the person is booked to, ignoring leave. */
  totalPct: number;
  /**
   * docs/16 §5 — allocation scaled by the days they are actually available over the
   * next fortnight. Somebody away all fortnight reads 0, not "100% allocated".
   */
  effectivePct: number;
  /** 0–1 availability over that window; 1 when they are not away at all. */
  availability: number;
  /** Set while they are away today — drives the "On leave until 12 Aug" badge. */
  onLeaveUntil: Date | null;
  allocations: { projectCode: string; projectName: string; role: string; allocationPct: number | null }[];
}

/** All people with their project allocations — powers the /people workload view.
 * Leave-aware since M6-A (docs/16 §5): the effective figure subtracts the days each
 * person is away over the coming fortnight, so nobody reads "on leave but 100%
 * allocated". The typed allocation is kept alongside it, because both are true. */
export async function listWorkload(ctx: TenantContext, now = new Date()): Promise<WorkloadRow[]> {
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + 14 * 86_400_000);
  return withTenant(ctx, async (tx) => {
    const [users, absences] = await Promise.all([
      tx.user.findMany({
        where: { status: { not: "DELETED" } },
        include: {
          department: { select: { name: true } },
          projectAllocations: { include: { project: { select: { code: true, name: true } } } },
        },
        orderBy: { name: "asc" },
      }),
      tx.absence.findMany({
        where: { startDate: { lte: windowEnd }, endDate: { gte: windowStart } },
        select: { userId: true, startDate: true, endDate: true },
      }),
    ]);
    const byUser = new Map<string, { startDate: Date; endDate: Date }[]>();
    for (const a of absences) {
      const list = byUser.get(a.userId) ?? [];
      list.push(a);
      byUser.set(a.userId, list);
    }
    return users.map((u) => {
      const mine = byUser.get(u.id) ?? [];
      const availability = availabilityFactor(mine, windowStart, windowEnd);
      const totalPct = u.projectAllocations.reduce((n, a) => n + (a.allocationPct ?? 0), 0);
      // Away TODAY → the badge; a future absence lowers capacity without a badge.
      const activeNow = mine.filter((a) => a.startDate <= now && a.endDate >= now);
      const onLeaveUntil = activeNow.length
        ? activeNow.reduce((latest, a) => (a.endDate > latest ? a.endDate : latest), activeNow[0].endDate)
        : null;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        departmentName: u.department?.name ?? null,
        projectCount: u.projectAllocations.length,
        totalPct,
        effectivePct: Math.round(totalPct * availability),
        availability,
        onLeaveUntil,
        allocations: u.projectAllocations.map((a) => ({
          projectCode: a.project.code,
          projectName: a.project.name,
          role: a.role,
          allocationPct: a.allocationPct,
        })),
      };
    });
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

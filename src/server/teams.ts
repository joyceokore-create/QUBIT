import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Teams — cross-functional groups of people, distinct from the Department org
 * hierarchy (MVP1). Mirrors the audited, RLS-scoped pattern of departments.ts.
 */

export class TeamError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export const CreateTeamInput = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  leadUserId: z.string().uuid().nullable().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInput>;

export const UpdateTeamInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  leadUserId: z.string().uuid().nullable().optional(),
  memberIds: z.array(z.string().uuid()).optional(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamInput>;

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  leadUserId: string | null;
  leadUserName: string | null;
  memberCount: number;
  createdAt: Date;
}

export interface TeamDetail extends TeamSummary {
  members: { userId: string; name: string; email: string }[];
}

export async function listTeams(ctx: TenantContext): Promise<TeamSummary[]> {
  return withTenant(ctx, async (tx) => {
    const teams = await tx.team.findMany({
      include: { lead: { select: { name: true } }, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      leadUserId: t.leadUserId,
      leadUserName: t.lead?.name ?? null,
      memberCount: t._count.members,
      createdAt: t.createdAt,
    }));
  });
}

export async function getTeam(ctx: TenantContext, id: string): Promise<TeamDetail | null> {
  return withTenant(ctx, async (tx) => {
    const t = await tx.team.findUnique({
      where: { id },
      include: {
        lead: { select: { name: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      leadUserId: t.leadUserId,
      leadUserName: t.lead?.name ?? null,
      memberCount: t.members.length,
      createdAt: t.createdAt,
      members: t.members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email })),
    };
  });
}

export async function createTeam(ctx: TenantContext, input: CreateTeamInput) {
  return withTenant(ctx, async (tx) => {
    const team = await tx.team.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        leadUserId: input.leadUserId ?? null,
      },
    });
    if (input.memberIds?.length) {
      await tx.teamMember.createMany({
        data: input.memberIds.map((userId) => ({ tenantId: ctx.tenantId, teamId: team.id, userId })),
        skipDuplicates: true,
      });
    }
    await audit(tx, ctx, {
      action: "create",
      entityType: "team",
      entityId: team.id,
      before: null,
      after: { name: team.name, leadUserId: team.leadUserId, members: input.memberIds?.length ?? 0 },
    });
    return team;
  });
}

export async function updateTeam(ctx: TenantContext, id: string, input: UpdateTeamInput) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.team.findUniqueOrThrow({ where: { id } });
    const team = await tx.team.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description,
        leadUserId: input.leadUserId === undefined ? undefined : input.leadUserId,
      },
    });
    if (input.memberIds) {
      // Replace the membership set.
      await tx.teamMember.deleteMany({ where: { teamId: id } });
      if (input.memberIds.length) {
        await tx.teamMember.createMany({
          data: input.memberIds.map((userId) => ({ tenantId: ctx.tenantId, teamId: id, userId })),
          skipDuplicates: true,
        });
      }
    }
    await audit(tx, ctx, {
      action: "update",
      entityType: "team",
      entityId: id,
      before: { name: before.name, leadUserId: before.leadUserId },
      after: { name: team.name, leadUserId: team.leadUserId },
    });
    return team;
  });
}

export async function deleteTeam(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.team.findUniqueOrThrow({ where: { id } });
    await tx.team.delete({ where: { id } }); // cascades team_member + project_team
    await audit(tx, ctx, {
      action: "delete",
      entityType: "team",
      entityId: id,
      before: { name: before.name },
      after: null,
    });
    return { id };
  });
}

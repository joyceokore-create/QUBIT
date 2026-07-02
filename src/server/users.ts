import { z } from "zod";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { hashPassword, validatePasswordPolicy } from "@/lib/password";
import { ROLE_PERMISSIONS } from "@/lib/rbac";

const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS) as [string, ...string[]];

export const CreateUserInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  roles: z.array(z.enum(ROLE_KEYS)).min(1),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateRolesInput = z.object({
  roles: z.array(z.enum(ROLE_KEYS)).min(1),
});
export type UpdateRolesInput = z.infer<typeof UpdateRolesInput>;

/** Thrown for admin-user-management failures the API layer should surface as 400s. */
export class UserAdminError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: string[];
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  createdAt: Date;
}

export async function listUsers(
  ctx: TenantContext,
  opts: { includeDeleted?: boolean } = {},
): Promise<AdminUserSummary[]> {
  return withTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({
      where: opts.includeDeleted ? undefined : { status: { not: "DELETED" } },
      include: {
        roles: true,
        department: { select: { name: true } },
        manager: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      roles: u.roles.map((r) => r.role),
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      managerId: u.managerId,
      managerName: u.manager?.name ?? null,
      createdAt: u.createdAt,
    }));
  });
}

export async function createUser(ctx: TenantContext, input: CreateUserInput) {
  const policyError = validatePasswordPolicy(input.password);
  if (policyError) throw new UserAdminError(policyError, "WEAK_PASSWORD");

  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  return withTenant(ctx, async (tx) => {
    const existing = await tx.user.findUnique({
      where: { tenantId_email: { tenantId: ctx.tenantId, email } },
    });
    if (existing) {
      throw new UserAdminError("A user with this email already exists.", "EMAIL_TAKEN");
    }

    const user = await tx.user.create({
      data: { tenantId: ctx.tenantId, email, name: input.name, status: "ACTIVE", passwordHash },
    });

    for (const role of input.roles) {
      await tx.roleAssignment.create({ data: { tenantId: ctx.tenantId, userId: user.id, role } });
      await audit(tx, ctx, {
        action: "role_grant",
        entityType: "user",
        entityId: user.id,
        after: { role },
      });
    }

    await audit(tx, ctx, {
      action: "create",
      entityType: "user",
      entityId: user.id,
      after: { name: user.name, email: user.email, roles: input.roles },
    });

    return user;
  });
}

export async function updateUserRoles(
  ctx: TenantContext,
  userId: string,
  roles: string[],
): Promise<void> {
  if (userId === ctx.userId && ctx.roles.includes("SystemAdmin") && !roles.includes("SystemAdmin")) {
    throw new UserAdminError("You cannot remove your own SystemAdmin role.", "SELF_DEMOTE");
  }

  await withTenant(ctx, async (tx) => {
    const current = await tx.roleAssignment.findMany({ where: { userId } });
    const currentRoles = current.map((r) => r.role);

    const toAdd = roles.filter((role) => !currentRoles.includes(role));
    const toRemove = current.filter((assignment) => !roles.includes(assignment.role));

    for (const role of toAdd) {
      await tx.roleAssignment.create({ data: { tenantId: ctx.tenantId, userId, role } });
      await audit(tx, ctx, {
        action: "role_grant",
        entityType: "user",
        entityId: userId,
        after: { role },
      });
    }
    for (const assignment of toRemove) {
      await tx.roleAssignment.delete({ where: { id: assignment.id } });
      await audit(tx, ctx, {
        action: "role_revoke",
        entityType: "user",
        entityId: userId,
        before: { role: assignment.role },
      });
    }
  });
}

export async function setUserStatus(
  ctx: TenantContext,
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<void> {
  if (userId === ctx.userId) {
    throw new UserAdminError("You cannot change your own account status.", "SELF_ACTION");
  }

  await withTenant(ctx, async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const after = await tx.user.update({ where: { id: userId }, data: { status } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "user",
      entityId: userId,
      before: { status: before.status },
      after: { status: after.status },
    });
  });
}

export const UpdateUserDepartmentInput = z.object({
  departmentId: z.string().uuid().nullable(),
  managerId: z.string().uuid().nullable(),
});
export type UpdateUserDepartmentInput = z.infer<typeof UpdateUserDepartmentInput>;

export async function updateUserDepartment(
  ctx: TenantContext,
  userId: string,
  input: UpdateUserDepartmentInput,
): Promise<void> {
  if (input.managerId && input.managerId === userId) {
    throw new UserAdminError("A user cannot be their own manager.", "SELF_MANAGER");
  }

  await withTenant(ctx, async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { departmentId: true, managerId: true },
    });

    if (input.departmentId) {
      const department = await tx.department.findUnique({ where: { id: input.departmentId } });
      if (!department) throw new UserAdminError("Department not found.", "NOT_FOUND");
    }
    if (input.managerId) {
      const manager = await tx.user.findUnique({ where: { id: input.managerId } });
      if (!manager || manager.status === "DELETED") {
        throw new UserAdminError("Manager not found.", "NOT_FOUND");
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: { departmentId: input.departmentId, managerId: input.managerId },
    });

    await audit(tx, ctx, {
      action: "update",
      entityType: "user",
      entityId: userId,
      before,
      after: input,
    });
  });
}

export async function softDeleteUser(ctx: TenantContext, userId: string): Promise<void> {
  if (userId === ctx.userId) {
    throw new UserAdminError("You cannot delete your own account.", "SELF_ACTION");
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });

  await withTenant(ctx, async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });

    await tx.roleAssignment.deleteMany({ where: { userId } });
    // Stop this user from silently lingering as someone's manager or a department's head
    // once deleted — folded into the same "delete" audit entry, not audited separately,
    // matching how roleAssignment.deleteMany just above isn't audited on its own either.
    await tx.department.updateMany({ where: { headUserId: userId }, data: { headUserId: null } });
    await tx.user.updateMany({ where: { managerId: userId }, data: { managerId: null } });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: "Deleted user",
        email: `deleted-${userId}@${tenant.slug}.invalid`,
        passwordHash: null,
        mfaSecret: null,
        previousPasswordHashes: [],
        status: "DELETED",
        deletedAt: new Date(),
      },
    });

    // Deliberately retains the pre-scrub name/email in `before` — audit trails are the one
    // place BRD's "preserve referential integrity for audit" implies retention over
    // erasure. See docs/11-security-compliance.md.
    await audit(tx, ctx, {
      action: "delete",
      entityType: "user",
      entityId: userId,
      before: { name: before.name, email: before.email, status: before.status },
    });
  });
}

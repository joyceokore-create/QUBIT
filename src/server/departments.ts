import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

export class DepartmentAdminError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export const CreateDepartmentInput = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
  orgUnitId: z.string().uuid().nullable().optional(),
  headUserId: z.string().uuid().nullable().optional(),
});
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentInput>;

export const UpdateDepartmentInput = CreateDepartmentInput.partial();
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentInput>;

export interface DepartmentSummary {
  id: string;
  name: string;
  parentId: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  headUserId: string | null;
  headUserName: string | null;
  memberCount: number;
  childCount: number;
  createdAt: Date;
}

export async function listDepartments(ctx: TenantContext): Promise<DepartmentSummary[]> {
  return withTenant(ctx, async (tx) => {
    const departments = await tx.department.findMany({
      include: {
        orgUnit: { select: { name: true } },
        headUser: { select: { name: true } },
        _count: { select: { members: true, children: true } },
      },
      orderBy: { name: "asc" },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      orgUnitId: d.orgUnitId,
      orgUnitName: d.orgUnit?.name ?? null,
      headUserId: d.headUserId,
      headUserName: d.headUser?.name ?? null,
      memberCount: d._count.members,
      childCount: d._count.children,
      createdAt: d.createdAt,
    }));
  });
}

export async function listOrgUnitOptions(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  return withTenant(ctx, (tx) => tx.orgUnit.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }));
}

async function assertNoCycle(
  tx: Prisma.TransactionClient,
  departmentId: string,
  newParentId: string,
): Promise<void> {
  const seen = new Set<string>([departmentId]);
  let cursor: string | null = newParentId;
  while (cursor) {
    if (seen.has(cursor)) {
      throw new DepartmentAdminError("A department cannot become its own ancestor.", "CYCLE");
    }
    seen.add(cursor);
    const row: { parentId: string | null } | null = await tx.department.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
  }
}

async function assertReferencesExist(
  tx: Prisma.TransactionClient,
  input: { parentId?: string | null; orgUnitId?: string | null; headUserId?: string | null },
): Promise<void> {
  if (input.parentId) {
    const parent = await tx.department.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new DepartmentAdminError("Parent department not found.", "NOT_FOUND");
  }
  if (input.orgUnitId) {
    const orgUnit = await tx.orgUnit.findUnique({ where: { id: input.orgUnitId } });
    if (!orgUnit) throw new DepartmentAdminError("Org unit not found.", "NOT_FOUND");
  }
  if (input.headUserId) {
    const head = await tx.user.findUnique({ where: { id: input.headUserId } });
    if (!head || head.status === "DELETED") {
      throw new DepartmentAdminError("Head of department not found.", "NOT_FOUND");
    }
  }
}

export async function createDepartment(ctx: TenantContext, input: CreateDepartmentInput) {
  return withTenant(ctx, async (tx) => {
    await assertReferencesExist(tx, input);

    const department = await tx.department.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        parentId: input.parentId ?? null,
        orgUnitId: input.orgUnitId ?? null,
        headUserId: input.headUserId ?? null,
      },
    });

    await audit(tx, ctx, {
      action: "create",
      entityType: "department",
      entityId: department.id,
      after: { name: department.name, parentId: department.parentId },
    });

    return department;
  });
}

export async function updateDepartment(
  ctx: TenantContext,
  departmentId: string,
  input: UpdateDepartmentInput,
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });

    await assertReferencesExist(tx, input);
    if (input.parentId) {
      await assertNoCycle(tx, departmentId, input.parentId);
    }

    const after = await tx.department.update({
      where: { id: departmentId },
      data: {
        name: input.name,
        parentId: input.parentId === undefined ? undefined : input.parentId,
        orgUnitId: input.orgUnitId === undefined ? undefined : input.orgUnitId,
        headUserId: input.headUserId === undefined ? undefined : input.headUserId,
      },
    });

    await audit(tx, ctx, {
      action: "update",
      entityType: "department",
      entityId: departmentId,
      before: { name: before.name, parentId: before.parentId, orgUnitId: before.orgUnitId, headUserId: before.headUserId },
      after: { name: after.name, parentId: after.parentId, orgUnitId: after.orgUnitId, headUserId: after.headUserId },
    });
  });
}

export async function deleteDepartment(ctx: TenantContext, departmentId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.department.findUniqueOrThrow({ where: { id: departmentId } });

    const childCount = await tx.department.count({ where: { parentId: departmentId } });
    if (childCount > 0) {
      throw new DepartmentAdminError("Reassign or delete child departments first.", "HAS_CHILDREN");
    }
    const memberCount = await tx.user.count({ where: { departmentId } });
    if (memberCount > 0) {
      throw new DepartmentAdminError("Reassign members before deleting this department.", "HAS_MEMBERS");
    }

    await tx.department.delete({ where: { id: departmentId } });

    await audit(tx, ctx, {
      action: "delete",
      entityType: "department",
      entityId: departmentId,
      before: { name: before.name, parentId: before.parentId },
    });
  });
}

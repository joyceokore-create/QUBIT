// Department/org-structure lifecycle: hierarchy, cycle prevention, delete guards, tenant
// isolation, and the audit trail. Requires a migrated, seeded DB (`pnpm prisma:seed`).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  DepartmentAdminError,
} from "@/server/departments";
import { createUser, updateUserDepartment, softDeleteUser, UserAdminError } from "@/server/users";

const TEST_PREFIX = "Test Dept Lifecycle";
const TEST_EMAIL_MANAGER = "test-dept-manager@kcb.example.invalid";
const TEST_EMAIL_REPORT = "test-dept-report@kcb.example.invalid";

describe("Department lifecycle", () => {
  let kcbId: string;
  let riverbankId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) {
      throw new Error("Department tests require seeded data — run `pnpm prisma:seed` first.");
    }
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    ctx = { tenantId: kcbId, userId: "test-dept-actor", roles: ["PlatformSuperAdmin"] };
  });

  beforeEach(async () => {
    await withTenant(ctx, async (tx) => {
      const stale = await tx.department.findMany({ where: { name: { startsWith: TEST_PREFIX } } });
      const ids = stale.map((d) => d.id);
      if (ids.length) {
        await tx.auditLog.deleteMany({ where: { entityId: { in: ids } } });
        await tx.user.updateMany({ where: { departmentId: { in: ids } }, data: { departmentId: null } });
        // Children before parents to satisfy the FK, oldest-created-last heuristic is fine
        // since these tests never build more than two levels.
        await tx.department.deleteMany({ where: { id: { in: ids }, parentId: { not: null } } });
        await tx.department.deleteMany({ where: { id: { in: ids } } });
      }
      for (const email of [TEST_EMAIL_MANAGER, TEST_EMAIL_REPORT]) {
        const existing = await tx.user.findUnique({ where: { tenantId_email: { tenantId: kcbId, email } } });
        if (existing) {
          await tx.auditLog.deleteMany({ where: { entityId: existing.id } });
          await tx.roleAssignment.deleteMany({ where: { userId: existing.id } });
          await tx.user.delete({ where: { id: existing.id } });
        }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a parent + child department and writes create audit rows", async () => {
    const parent = await createDepartment(ctx, { name: `${TEST_PREFIX} Parent` });
    const child = await createDepartment(ctx, { name: `${TEST_PREFIX} Child`, parentId: parent.id });

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: { in: [parent.id, child.id] }, action: "create" } }),
    );
    expect(rows).toHaveLength(2);

    const parentRow = await withTenant(ctx, (tx) =>
      tx.department.findUniqueOrThrow({ where: { id: parent.id }, include: { _count: { select: { children: true } } } }),
    );
    expect(parentRow._count.children).toBe(1);
  });

  it("rejects a parent change that would create a cycle, including direct self-parenting", async () => {
    const a = await createDepartment(ctx, { name: `${TEST_PREFIX} A` });
    const b = await createDepartment(ctx, { name: `${TEST_PREFIX} B`, parentId: a.id });

    await expect(updateDepartment(ctx, a.id, { parentId: b.id })).rejects.toThrow(DepartmentAdminError);
    await expect(updateDepartment(ctx, a.id, { parentId: a.id })).rejects.toThrow(DepartmentAdminError);
  });

  it("rejects deleting a department with children, then succeeds once the child is gone", async () => {
    const parent = await createDepartment(ctx, { name: `${TEST_PREFIX} Parent` });
    const child = await createDepartment(ctx, { name: `${TEST_PREFIX} Child`, parentId: parent.id });

    await expect(deleteDepartment(ctx, parent.id)).rejects.toThrow(DepartmentAdminError);

    await deleteDepartment(ctx, child.id);
    await deleteDepartment(ctx, parent.id);

    const deleteAudit = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({ where: { entityId: parent.id, action: "delete" } }),
    );
    expect(deleteAudit).not.toBeNull();
  });

  it("rejects deleting a department with member users", async () => {
    const department = await createDepartment(ctx, { name: `${TEST_PREFIX} Staffed` });
    const user = await createUser(ctx, {
      name: "Test Dept Report",
      email: TEST_EMAIL_REPORT,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });

    await updateUserDepartment(ctx, user.id, { departmentId: department.id, managerId: null });

    await expect(deleteDepartment(ctx, department.id)).rejects.toThrow(DepartmentAdminError);
  });

  it("assigns a user's department + manager and audits the change, rejecting self-as-manager", async () => {
    const department = await createDepartment(ctx, { name: `${TEST_PREFIX} Staffed` });
    const manager = await createUser(ctx, {
      name: "Test Dept Manager",
      email: TEST_EMAIL_MANAGER,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });
    const report = await createUser(ctx, {
      name: "Test Dept Report",
      email: TEST_EMAIL_REPORT,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });

    await expect(updateUserDepartment(ctx, report.id, { departmentId: null, managerId: report.id })).rejects.toThrow(
      UserAdminError,
    );

    await updateUserDepartment(ctx, report.id, { departmentId: department.id, managerId: manager.id });

    const after = await withTenant(ctx, (tx) => tx.user.findUniqueOrThrow({ where: { id: report.id } }));
    expect(after.departmentId).toBe(department.id);
    expect(after.managerId).toBe(manager.id);

    const auditRow = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({ where: { entityId: report.id, action: "update" }, orderBy: { createdAt: "desc" } }),
    );
    expect(auditRow?.after).toMatchObject({ departmentId: department.id, managerId: manager.id });
  });

  it("nulls out dependents' managerId/headUserId when the manager/head is soft-deleted", async () => {
    const manager = await createUser(ctx, {
      name: "Test Dept Manager",
      email: TEST_EMAIL_MANAGER,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });
    const report = await createUser(ctx, {
      name: "Test Dept Report",
      email: TEST_EMAIL_REPORT,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });
    await updateUserDepartment(ctx, report.id, { departmentId: null, managerId: manager.id });
    const department = await createDepartment(ctx, { name: `${TEST_PREFIX} Headed`, headUserId: manager.id });

    await softDeleteUser(ctx, manager.id);

    const reportAfter = await withTenant(ctx, (tx) => tx.user.findUniqueOrThrow({ where: { id: report.id } }));
    expect(reportAfter.managerId).toBeNull();

    const departmentAfter = await withTenant(ctx, (tx) => tx.department.findUniqueOrThrow({ where: { id: department.id } }));
    expect(departmentAfter.headUserId).toBeNull();

    await deleteDepartment(ctx, department.id);
  });

  it("keeps departments tenant-isolated", async () => {
    const department = await createDepartment(ctx, { name: `${TEST_PREFIX} KCB Only` });

    const riverbankCtx: TenantContext = {
      tenantId: riverbankId,
      userId: "test-dept-actor",
      roles: ["PlatformSuperAdmin"],
    };
    const found = await withTenant(riverbankCtx, (tx) => tx.department.findUnique({ where: { id: department.id } }));
    expect(found).toBeNull();

    await deleteDepartment(ctx, department.id);
  });
});

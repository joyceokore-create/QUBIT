// Custom roles (tuma-style permission bundles). Requires a migrated, seeded DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  createCustomRole,
  updateCustomRole,
  setCustomRoleStatus,
  setRolePermissions,
  listRolePermissions,
  listAssignableRoles,
  resolvePermissionsForRoles,
  RolePermissionError,
} from "@/server/role-permissions";
import { updateUserRoles, UserAdminError } from "@/server/users";

describe("custom roles", () => {
  let demoBId: string;
  let riverbankId: string;
  let ctx: TenantContext;
  let rbCtx: TenantContext;
  let memberUserId: string;

  beforeAll(async () => {
    const [demoB, rb] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !rb) throw new Error("custom-role tests require seeded data — run `pnpm prisma:seed` first.");
    demoBId = demoB.id;
    riverbankId = rb.id;
    // A real seeded super admin id so RoleAssignment/audit FKs and self-demote guards behave.
    const bootCtx: TenantContext = { tenantId: demoBId, userId: "auth", roles: ["PlatformSuperAdmin"] };
    const admin = await withTenant(bootCtx, (tx) =>
      tx.user.findFirstOrThrow({ where: { roles: { some: { role: "PlatformSuperAdmin" } } } }),
    );
    ctx = { tenantId: demoBId, userId: admin.id, roles: ["PlatformSuperAdmin"], permissions: ["*"] };
    rbCtx = { tenantId: riverbankId, userId: "test-customrole-rb", roles: ["PlatformSuperAdmin"], permissions: ["*"] };

    const member = await withTenant(ctx, (tx) =>
      tx.user.findFirstOrThrow({ where: { status: "ACTIVE", id: { not: admin.id } } }),
    );
    memberUserId = member.id;
  });

  async function reset(c: TenantContext) {
    await withTenant(c, async (tx) => {
      const customs = await tx.customRole.findMany({ select: { name: true } });
      const names = customs.map((r) => r.name);
      if (names.length) {
        await tx.roleAssignment.deleteMany({ where: { role: { in: names } } });
        await tx.rolePermission.deleteMany({ where: { role: { in: names } } });
      }
      await tx.customRole.deleteMany({});
      await tx.auditLog.deleteMany({ where: { entityType: "custom_role" } });
    });
  }

  beforeEach(async () => {
    await reset(ctx);
    await reset(rbCtx);
  });

  afterAll(async () => {
    await reset(ctx);
    await reset(rbCtx);
    await prisma.$disconnect();
  });

  it("full lifecycle: create → assign → resolve → deactivate (fail-closed) → reactivate", async () => {
    const id = await createCustomRole(ctx, {
      name: "Finance Reviewer",
      description: "Budget read only",
      permissions: ["budget:read", "dashboard:read"],
    });
    expect(id).toBeTruthy();

    // Listed after the canonical six, with metadata.
    const listed = (await listRolePermissions(ctx)).find((r) => r.role === "Finance Reviewer");
    expect(listed?.custom?.status).toBe("Active");
    expect(listed?.permissions.sort()).toEqual(["budget:read", "dashboard:read"]);

    // Assignable + resolvable at login exactly like a canonical role.
    expect(await listAssignableRoles(ctx)).toContain("Finance Reviewer");
    await updateUserRoles(ctx, memberUserId, ["Member", "Finance Reviewer"]);
    const perms = await withTenant(ctx, (tx) =>
      resolvePermissionsForRoles(tx, demoBId, ["Finance Reviewer"]),
    );
    expect(perms.sort()).toEqual(["budget:read", "dashboard:read"]);

    // Deactivation: rows + assignment survive, resolution fails closed to [].
    await setCustomRoleStatus(ctx, id, "Deactivated", "restructure");
    const after = await withTenant(ctx, (tx) => resolvePermissionsForRoles(tx, demoBId, ["Finance Reviewer"]));
    expect(after).toEqual([]);
    const assignments = await withTenant(ctx, (tx) =>
      tx.roleAssignment.findMany({ where: { userId: memberUserId, role: "Finance Reviewer" } }),
    );
    expect(assignments).toHaveLength(1);
    expect(await listAssignableRoles(ctx)).not.toContain("Finance Reviewer");

    // Reactivation restores the saved set.
    await setCustomRoleStatus(ctx, id, "Active");
    const restored = await withTenant(ctx, (tx) => resolvePermissionsForRoles(tx, demoBId, ["Finance Reviewer"]));
    expect(restored.sort()).toEqual(["budget:read", "dashboard:read"]);
  });

  it("guards: canonical name collision, duplicate, catalogue-only permissions, deactivation reason", async () => {
    await expect(
      createCustomRole(ctx, { name: "ProjectManager", permissions: [] }),
    ).rejects.toThrow(RolePermissionError);
    await expect(
      createCustomRole(ctx, { name: "projectmanager", permissions: [] }),
    ).rejects.toThrow(/built-in/i);

    const id = await createCustomRole(ctx, { name: "Ops", permissions: [] });
    await expect(createCustomRole(ctx, { name: "ops", permissions: [] })).rejects.toThrow(/already exists/i);

    await expect(
      createCustomRole(ctx, { name: "Hacker", permissions: ["*"] }),
    ).rejects.toThrow(RolePermissionError);
    await expect(setRolePermissions(ctx, "Ops", ["not:a:permission"])).rejects.toThrow(RolePermissionError);

    await expect(setCustomRoleStatus(ctx, id, "Deactivated")).rejects.toThrow(/reason/i);
  });

  it("rename cascades to permissions and assignments in one transaction", async () => {
    const id = await createCustomRole(ctx, { name: "Auditor", permissions: ["dashboard:read"] });
    await updateUserRoles(ctx, memberUserId, ["Member", "Auditor"]);

    await updateCustomRole(ctx, id, { name: "Compliance Auditor" });

    const oldRows = await withTenant(ctx, (tx) =>
      tx.rolePermission.findMany({ where: { role: "Auditor" } }),
    );
    expect(oldRows).toHaveLength(0);
    const perms = await withTenant(ctx, (tx) => resolvePermissionsForRoles(tx, demoBId, ["Compliance Auditor"]));
    expect(perms).toEqual(["dashboard:read"]);
    const assignment = await withTenant(ctx, (tx) =>
      tx.roleAssignment.findFirst({ where: { userId: memberUserId, role: "Compliance Auditor" } }),
    );
    expect(assignment).not.toBeNull();
  });

  it("assignment validation: unknown and deactivated roles can't be ADDED, but held ones survive edits", async () => {
    await expect(updateUserRoles(ctx, memberUserId, ["Member", "No Such Role"])).rejects.toThrow(UserAdminError);

    const id = await createCustomRole(ctx, { name: "Temp Role", permissions: ["dashboard:read"] });
    await updateUserRoles(ctx, memberUserId, ["Member", "Temp Role"]);
    await setCustomRoleStatus(ctx, id, "Deactivated", "sunset");

    // Editing the user's OTHER roles keeps the deactivated assignment without erroring…
    await updateUserRoles(ctx, memberUserId, ["Member", "ProjectManager", "Temp Role"]);
    // …but ADDING it to someone new is rejected.
    const admin = ctx.userId;
    await expect(updateUserRoles(ctx, admin, ["PlatformSuperAdmin", "Temp Role"])).rejects.toThrow(/inactive/i);
  });

  it("rejects a permission that is Deactivated in the DB catalogue", async () => {
    // Park a real catalogue permission as Deactivated, then confirm it can't be granted.
    await prisma.permission.update({ where: { code: "budget:read" }, data: { status: "Deactivated" } });
    try {
      await expect(
        createCustomRole(ctx, { name: "Budget Snoop", permissions: ["budget:read"] }),
      ).rejects.toThrow(/catalogue/i);
    } finally {
      await prisma.permission.update({ where: { code: "budget:read" }, data: { status: "Active" } });
    }
  });

  it("RLS: tenant B sees none of tenant A's custom roles", async () => {
    await createCustomRole(ctx, { name: "DemoB Only", permissions: ["dashboard:read"] });

    const rbView = await listRolePermissions(rbCtx);
    expect(rbView.find((r) => r.role === "DemoB Only")).toBeUndefined();
    expect(await listAssignableRoles(rbCtx)).not.toContain("DemoB Only");
    const rows = await withTenant(rbCtx, (tx) => tx.customRole.findMany({}));
    expect(rows).toHaveLength(0);

    // Same name may exist independently per tenant.
    await expect(createCustomRole(rbCtx, { name: "DemoB Only", permissions: [] })).resolves.toBeTruthy();
  });

  it("audits create / update / status changes", async () => {
    const id = await createCustomRole(ctx, { name: "Audited Role", permissions: ["dashboard:read"] });
    await updateCustomRole(ctx, id, { description: "now described" });
    await setCustomRoleStatus(ctx, id, "Deactivated", "test");

    const logs = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityType: "custom_role", entityId: id }, orderBy: { createdAt: "asc" } }),
    );
    expect(logs.map((l) => l.action)).toEqual(["create", "update", "update"]);
  });
});

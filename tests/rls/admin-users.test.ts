// Admin/IAM v1 lifecycle: create, role grant/revoke, suspend, soft-delete — and that RLS
// still holds across tenants for admin-managed data. Requires a migrated, seeded DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  createUser,
  listUsers,
  setUserStatus,
  softDeleteUser,
  updateUserRoles,
  UserAdminError,
} from "@/server/users";

const TEST_EMAIL = "test-admin-lifecycle@demo-b.example.invalid";

describe("Admin/IAM user lifecycle", () => {
  let demoBId: string;
  let riverbankId: string;
  let adminCtx: TenantContext;

  beforeAll(async () => {
    const [demoB, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !riverbank) {
      throw new Error("Admin tests require seeded data — run `pnpm prisma:seed` first.");
    }
    demoBId = demoB.id;
    riverbankId = riverbank.id;
    adminCtx = { tenantId: demoBId, userId: "test-admin-actor", roles: ["PlatformSuperAdmin"] };
  });

  beforeEach(async () => {
    await withTenant(adminCtx, async (tx) => {
      const existing = await tx.user.findUnique({
        where: { tenantId_email: { tenantId: demoBId, email: TEST_EMAIL } },
      });
      if (existing) {
        await tx.roleAssignment.deleteMany({ where: { userId: existing.id } });
        await tx.auditLog.deleteMany({ where: { entityId: existing.id } });
        await tx.user.delete({ where: { id: existing.id } });
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a user with roles and writes create + role_grant audit rows", async () => {
    const user = await createUser(adminCtx, {
      name: "Test Lifecycle User",
      email: TEST_EMAIL,
      password: "Passw0rd!23",
      roles: ["Contributor", "Viewer"],
    });

    const rows = await withTenant(adminCtx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: user.id }, orderBy: { createdAt: "asc" } }),
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("create");
    expect(actions.filter((a) => a === "role_grant")).toHaveLength(2);

    const listed = await listUsers(adminCtx);
    const found = listed.find((u) => u.id === user.id);
    expect(found?.roles.sort()).toEqual(["Contributor", "Viewer"]);
  });

  it("diffs role changes and audits grants/revokes separately", async () => {
    const user = await createUser(adminCtx, {
      name: "Test Lifecycle User",
      email: TEST_EMAIL,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });

    await updateUserRoles(adminCtx, user.id, ["ProjectManager"]);

    const rows = await withTenant(adminCtx, (tx) =>
      tx.auditLog.findMany({
        where: { entityId: user.id, action: { in: ["role_grant", "role_revoke"] } },
      }),
    );
    expect(rows.some((r) => r.action === "role_revoke")).toBe(true);
    expect(rows.some((r) => r.action === "role_grant")).toBe(true);

    const listed = await listUsers(adminCtx);
    expect(listed.find((u) => u.id === user.id)?.roles).toEqual(["ProjectManager"]);
  });

  it("suspend flips status so login would be rejected, and reactivate restores it", async () => {
    const user = await createUser(adminCtx, {
      name: "Test Lifecycle User",
      email: TEST_EMAIL,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });

    await setUserStatus(adminCtx, user.id, "SUSPENDED");
    let listed = await listUsers(adminCtx, { includeDeleted: true });
    expect(listed.find((u) => u.id === user.id)?.status).toBe("SUSPENDED");

    await setUserStatus(adminCtx, user.id, "ACTIVE");
    listed = await listUsers(adminCtx);
    expect(listed.find((u) => u.id === user.id)?.status).toBe("ACTIVE");
  });

  it("soft-delete scrubs PII, blocks re-login eligibility, and retains history for audit", async () => {
    const user = await createUser(adminCtx, {
      name: "Test Lifecycle User",
      email: TEST_EMAIL,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });

    await softDeleteUser(adminCtx, user.id);

    const after = await withTenant(adminCtx, (tx) => tx.user.findUniqueOrThrow({ where: { id: user.id } }));
    expect(after.status).toBe("DELETED");
    expect(after.name).toBe("Deleted user");
    expect(after.email).not.toBe(TEST_EMAIL);
    expect(after.passwordHash).toBeNull();
    expect(after.deletedAt).not.toBeNull();

    const roles = await withTenant(adminCtx, (tx) => tx.roleAssignment.findMany({ where: { userId: user.id } }));
    expect(roles).toHaveLength(0);

    const deleteAudit = await withTenant(adminCtx, (tx) =>
      tx.auditLog.findFirst({ where: { entityId: user.id, action: "delete" } }),
    );
    expect(deleteAudit?.before).toMatchObject({ name: "Test Lifecycle User", email: TEST_EMAIL });

    // Excluded from the default (non-deleted) listing.
    const listed = await listUsers(adminCtx);
    expect(listed.find((u) => u.id === user.id)).toBeUndefined();
  });

  it("blocks an admin from suspending, deleting, or self-demoting their own account", async () => {
    const selfCtx: TenantContext = { tenantId: demoBId, userId: "self-actor", roles: ["PlatformSuperAdmin"] };

    await expect(setUserStatus(selfCtx, "self-actor", "SUSPENDED")).rejects.toThrow(UserAdminError);
    await expect(softDeleteUser(selfCtx, "self-actor")).rejects.toThrow(UserAdminError);
    await expect(updateUserRoles(selfCtx, "self-actor", ["Member"])).rejects.toThrow(UserAdminError);
  });

  it("keeps admin-managed users tenant-isolated", async () => {
    const user = await createUser(adminCtx, {
      name: "Test Lifecycle User",
      email: TEST_EMAIL,
      password: "Passw0rd!23",
      roles: ["Viewer"],
    });

    const riverbankCtx: TenantContext = {
      tenantId: riverbankId,
      userId: "test-admin-actor",
      roles: ["PlatformSuperAdmin"],
    };
    const riverbankUsers = await listUsers(riverbankCtx);
    expect(riverbankUsers.find((u) => u.id === user.id)).toBeUndefined();
  });
});

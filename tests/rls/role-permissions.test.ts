// Phase 1.5 — tenant-editable role permissions. Requires a migrated, seeded DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  listRolePermissions,
  setRolePermissions,
  resolvePermissionsForRoles,
  RolePermissionError,
} from "@/server/role-permissions";
import { ROLE_PERMISSIONS } from "@/lib/rbac";

describe("role permissions (Phase 1.5)", () => {
  let demoBId: string;
  let riverbankId: string;
  let ctx: TenantContext;
  let rbCtx: TenantContext;

  beforeAll(async () => {
    const [demoB, rb] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!demoB || !rb) throw new Error("role-permission tests require seeded data — run `pnpm prisma:seed` first.");
    demoBId = demoB.id;
    riverbankId = rb.id;
    ctx = { tenantId: demoBId, userId: "test-roleperm-actor", roles: ["PlatformSuperAdmin"] };
    rbCtx = { tenantId: riverbankId, userId: "test-roleperm-actor-rb", roles: ["PlatformSuperAdmin"] };
  });

  async function reset(c: TenantContext) {
    await withTenant(c, async (tx) => {
      await tx.rolePermission.deleteMany({});
      await tx.auditLog.deleteMany({ where: { entityType: "role_permission" } });
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

  it("resolves the code default when a role has no override", async () => {
    const perms = await withTenant(ctx, (tx) => resolvePermissionsForRoles(tx, demoBId, ["Member"]));
    expect([...perms].sort()).toEqual([...ROLE_PERMISSIONS.Member].sort());
  });

  it("applies a tenant override and reflects it in resolution + listing", async () => {
    await setRolePermissions(ctx, "Member", [...ROLE_PERMISSIONS.Member, "task:write"]);
    const perms = await withTenant(ctx, (tx) => resolvePermissionsForRoles(tx, demoBId, ["Member"]));
    expect(perms).toContain("task:write");

    const member = (await listRolePermissions(ctx)).find((r) => r.role === "Member")!;
    expect(member.customised).toBe(true);
    expect(member.permissions).toContain("task:write");
  });

  it("keeps overrides tenant-isolated (RLS)", async () => {
    await setRolePermissions(ctx, "Member", [...ROLE_PERMISSIONS.Member, "task:write"]);
    const rbPerms = await withTenant(rbCtx, (tx) => resolvePermissionsForRoles(tx, riverbankId, ["Member"]));
    expect(rbPerms).not.toContain("task:write");
    expect((await listRolePermissions(rbCtx)).find((r) => r.role === "Member")!.customised).toBe(false);
  });

  it("locks PlatformSuperAdmin (never editable; always full access)", async () => {
    await expect(setRolePermissions(ctx, "PlatformSuperAdmin", ["project:read"])).rejects.toBeInstanceOf(
      RolePermissionError,
    );
    const perms = await withTenant(ctx, (tx) => resolvePermissionsForRoles(tx, demoBId, ["PlatformSuperAdmin"]));
    expect(perms).toEqual(["*"]);
    expect((await listRolePermissions(ctx)).find((r) => r.role === "PlatformSuperAdmin")!.editable).toBe(false);
  });

  it("rejects permissions outside the catalogue", async () => {
    await expect(setRolePermissions(ctx, "Member", ["totally:made:up"])).rejects.toBeInstanceOf(RolePermissionError);
  });

  it("reverts to default when saving an empty set, and audits every change", async () => {
    await setRolePermissions(ctx, "Member", [...ROLE_PERMISSIONS.Member, "task:write"]);
    await setRolePermissions(ctx, "Member", []); // reset
    expect((await listRolePermissions(ctx)).find((r) => r.role === "Member")!.customised).toBe(false);

    const audits = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityType: "role_permission", entityId: "Member" } }),
    );
    expect(audits.length).toBe(2); // one for the grant, one for the reset
  });
});

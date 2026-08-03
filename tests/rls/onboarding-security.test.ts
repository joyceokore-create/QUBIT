// M-O1 (docs/20 §4): privilege-escalation guard. Only a Super Admin may grant the
// PlatformSuperAdmin role — via createUser (gated users:invite, held by Heads) or
// updateUserRoles. Requires a migrated, seeded DB.
import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createUser, updateUserRoles, UserAdminError } from "@/server/users";

const EMAIL = "test-privesc-guard@demo-b.example.invalid";

describe("Onboarding IAM — SuperAdmin grant guard", () => {
  let tenantId: string;
  let superAdminCtx: TenantContext;
  let headCtx: TenantContext;

  async function scrub() {
    await withTenant(superAdminCtx, async (tx) => {
      const u = await tx.user.findUnique({
        where: { tenantId_email: { tenantId, email: EMAIL } },
        select: { id: true },
      });
      if (u) {
        await tx.roleAssignment.deleteMany({ where: { userId: u.id } });
        await tx.auditLog.deleteMany({ where: { entityId: u.id } });
        await tx.user.delete({ where: { id: u.id } });
      }
    });
  }

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("Seed required — run `pnpm prisma:seed`.");
    tenantId = demoB.id;
    superAdminCtx = { tenantId, userId: "test-superadmin-actor", roles: ["PlatformSuperAdmin"] };
    headCtx = { tenantId, userId: "test-head-actor", roles: ["HeadOfProjects"] };
    await scrub();
  });

  afterEach(scrub);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("blocks a non-superadmin from CREATING a PlatformSuperAdmin", async () => {
    await expect(
      createUser(headCtx, {
        name: "Escalation Attempt",
        email: EMAIL,
        password: "Passw0rd!23xyz",
        roles: ["PlatformSuperAdmin"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_GRANT" });

    // Nothing should have been persisted (transaction rolled back before/at the guard).
    const leaked = await withTenant(superAdminCtx, (tx) =>
      tx.user.findUnique({ where: { tenantId_email: { tenantId, email: EMAIL } } }),
    );
    expect(leaked).toBeNull();
  });

  it("lets a non-superadmin create an ordinary user", async () => {
    const user = await createUser(headCtx, {
      name: "Ordinary Invitee",
      email: EMAIL,
      password: "Passw0rd!23xyz",
      roles: ["Member"],
    });
    expect(user.id).toBeTruthy();
  });

  it("blocks a non-superadmin from PROMOTING a user to PlatformSuperAdmin", async () => {
    const user = await createUser(superAdminCtx, {
      name: "Promotion Target",
      email: EMAIL,
      password: "Passw0rd!23xyz",
      roles: ["Member"],
    });
    await expect(
      updateUserRoles(headCtx, user.id, ["Member", "PlatformSuperAdmin"]),
    ).rejects.toBeInstanceOf(UserAdminError);

    const roles = await withTenant(superAdminCtx, (tx) =>
      tx.roleAssignment.findMany({ where: { userId: user.id } }),
    );
    expect(roles.map((r) => r.role)).not.toContain("PlatformSuperAdmin");
  });

  it("lets a Super Admin grant PlatformSuperAdmin", async () => {
    const user = await createUser(superAdminCtx, {
      name: "Legit Promotion",
      email: EMAIL,
      password: "Passw0rd!23xyz",
      roles: ["Member"],
    });
    await updateUserRoles(superAdminCtx, user.id, ["Member", "PlatformSuperAdmin"]);

    const roles = await withTenant(superAdminCtx, (tx) =>
      tx.roleAssignment.findMany({ where: { userId: user.id } }),
    );
    expect(roles.map((r) => r.role)).toContain("PlatformSuperAdmin");
  });
});

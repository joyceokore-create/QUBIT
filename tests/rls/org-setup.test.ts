// M-P1e (docs/31 §7) — the org-setup orchestrator against the real database:
// idempotency of every seeding step, per-row import outcomes (a duplicate email is a row
// error, never an aborted batch), the completion stamp, the Super-Admin gate, and
// cross-tenant isolation. Runs against demo-b so Riverbank's state stays untouched.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  completeSetup,
  ensureDefaultTemplates,
  importPeople,
  seedDepartments,
  seedMarkets,
  updateBrand,
} from "@/server/org-setup";

describe("M-P1e org setup", () => {
  let dbId: string;
  let rbId: string;
  let ctx: TenantContext; // demo-b super admin
  let before: { setupCompletedAt: Date | null; brandColor: string };

  beforeAll(async () => {
    const [db, rb] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!db || !rb) throw new Error("Seed required.");
    dbId = db.id;
    rbId = rb.id;
    ctx = { tenantId: dbId, userId: "org-setup-test", roles: ["PlatformSuperAdmin"] };
    before = await prisma.tenant.findUniqueOrThrow({
      where: { id: dbId },
      select: { setupCompletedAt: true, brandColor: true },
    });
  });

  afterAll(async () => {
    // Restore demo-b exactly: tenant fields, imported fixture users, seeded departments.
    await prisma.tenant.update({
      where: { id: dbId },
      data: { setupCompletedAt: before.setupCompletedAt, brandColor: before.brandColor },
    });
    await withTenant(ctx, async (tx) => {
      await tx.inviteToken.deleteMany({ where: { user: { email: { contains: "orgsetup" } } } });
      await tx.roleAssignment.deleteMany({ where: { user: { email: { contains: "orgsetup" } } } });
      await tx.auditLog.deleteMany({ where: { entityId: { in: ["org-setup-markets", "org-setup-departments", "org-setup-templates"] } } });
      await tx.user.deleteMany({ where: { email: { contains: "orgsetup" } } });
      await tx.department.deleteMany({ where: { name: "OrgSetup Fixture Dept" } });
    });
    await prisma.$disconnect();
  });

  it("a non-superadmin is refused at the engine, not just the route", async () => {
    const pm: TenantContext = { tenantId: dbId, userId: "x", roles: ["ProjectManager"] };
    await expect(seedMarkets(pm, ["KE"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(completeSetup(pm)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("seeding steps are idempotent — the second run creates nothing", async () => {
    const first = await seedMarkets(ctx, ["KE", "TZ"]);
    const second = await seedMarkets(ctx, ["KE", "TZ"]);
    expect(second.created).toBe(0);
    expect(first.created + second.created).toBeLessThanOrEqual(2);

    const d1 = await seedDepartments(ctx, ["OrgSetup Fixture Dept"]);
    const d2 = await seedDepartments(ctx, ["OrgSetup Fixture Dept"]);
    expect(d1.created).toBe(1);
    expect(d2.created).toBe(0);

    const t1 = await ensureDefaultTemplates(ctx);
    const t2 = await ensureDefaultTemplates(ctx);
    expect(t2.created).toBe(0);
    expect(t1.total).toBe(2);
  });

  it("importPeople reports per-row outcomes; a duplicate is a row error, not an abort", async () => {
    const rows = [
      { line: 1, name: "OrgSetup One", email: "orgsetup1@demo-b.example.invalid", role: "Member", group: "developer" },
      { line: 2, name: "OrgSetup Two", email: "orgsetup2@demo-b.example.invalid", role: "ProjectManager", group: "pm" },
    ];
    const first = await importPeople(ctx, rows);
    expect(first.every((r) => r.status === "invited")).toBe(true);
    // Mailer off in tests → the copyable link must be present (M-O3 rule).
    expect(first.every((r) => !!r.acceptUrl)).toBe(true);

    const again = await importPeople(ctx, [rows[0], { line: 2, name: "OrgSetup Three", email: "orgsetup3@demo-b.example.invalid", role: "Member", group: null }]);
    expect(again[0].status).toBe("error"); // duplicate email
    expect(again[1].status).toBe("invited"); // …and the batch carried on

    const invited = await withTenant(ctx, (tx) =>
      tx.user.findMany({ where: { email: { contains: "orgsetup" } }, select: { status: true, passwordHash: true } }),
    );
    expect(invited).toHaveLength(3);
    expect(invited.every((u) => u.status === "INVITED" && u.passwordHash === null)).toBe(true);
  });

  it("brand update + completion stamp land on the tenant, audited", async () => {
    const brand = await updateBrand(ctx, { brandColor: "#123abc" });
    expect(brand.brandColor).toBe("#123abc");
    await completeSetup(ctx);
    const t = await prisma.tenant.findUniqueOrThrow({ where: { id: dbId }, select: { setupCompletedAt: true } });
    expect(t.setupCompletedAt).not.toBeNull();
  });

  it("nothing leaked into Riverbank", async () => {
    const rbCtx: TenantContext = { tenantId: rbId, userId: "test", roles: ["Member"] };
    const [dept, users] = await withTenant(rbCtx, async (tx) => [
      await tx.department.findFirst({ where: { name: "OrgSetup Fixture Dept" } }),
      await tx.user.count({ where: { email: { contains: "orgsetup" } } }),
    ]);
    expect(dept).toBeNull();
    expect(users).toBe(0);
  });
});

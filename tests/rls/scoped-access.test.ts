// Phase 4 — per-resource admin enforcement helpers. Requires a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { canManageDepartment, canManageTeam } from "@/lib/access";

describe("scoped admin access (Phase 4)", () => {
  let tenantId: string;
  let headId: string;
  let otherId: string;
  let leadId: string;
  let deptId: string;
  let teamId: string;

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("scoped-access tests require seeded data — run `pnpm prisma:seed` first.");
    tenantId = demoB.id;
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      const [head, other, lead] = await Promise.all([
        tx.user.create({ data: { tenantId, email: "p4head@fixture.invalid", name: "P4 Head", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "p4other@fixture.invalid", name: "P4 Other", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "p4lead@fixture.invalid", name: "P4 Lead", status: "ACTIVE" } }),
      ]);
      headId = head.id;
      otherId = other.id;
      leadId = lead.id;
      const dept = await tx.department.create({ data: { tenantId, name: "P4 Dept", headUserId: head.id } });
      const team = await tx.team.create({ data: { tenantId, name: "P4 Team", leadUserId: lead.id } });
      deptId = dept.id;
      teamId = team.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      await tx.team.deleteMany({ where: { id: teamId } });
      await tx.department.deleteMany({ where: { id: deptId } });
      await tx.user.deleteMany({ where: { id: { in: [headId, otherId, leadId] } } });
    });
    await prisma.$disconnect();
  });

  const ctx = (userId: string, roles: string[]): TenantContext => ({ tenantId, userId, roles });

  it("canManageDepartment: SuperAdmin any; a head only their own; others denied", async () => {
    expect(await canManageDepartment(ctx("anyone", ["PlatformSuperAdmin"]), deptId)).toBe(true);
    expect(await canManageDepartment(ctx(headId, ["HeadOfProjects"]), deptId)).toBe(true);
    expect(await canManageDepartment(ctx(otherId, ["HeadOfProjects"]), deptId)).toBe(false);
    // The department's head user without a Head role can't manage it (needs the role too).
    expect(await canManageDepartment(ctx(headId, ["Member"]), deptId)).toBe(false);
  });

  it("canManageTeam: SuperAdmin/heads any; the team lead their own; others denied", async () => {
    expect(await canManageTeam(ctx("anyone", ["PlatformSuperAdmin"]), teamId)).toBe(true);
    expect(await canManageTeam(ctx("anyone", ["HeadOfQA"]), teamId)).toBe(true);
    expect(await canManageTeam(ctx(leadId, ["Member"]), teamId)).toBe(true);
    expect(await canManageTeam(ctx(otherId, ["Member"]), teamId)).toBe(false);
  });
});

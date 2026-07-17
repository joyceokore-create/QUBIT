// Phase 5 (§7) — Q person-workload access gating at the tool/mock layer. Requires a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { reportableUserIds } from "@/lib/access";
import { mockChat } from "@/server/q/mock";

describe("Q person-workload access gating (Phase 5 §7)", () => {
  let tenantId: string;
  let leadId: string;
  let memberId: string;
  let projectId: string;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("q-access tests require seeded data — run `pnpm prisma:seed` first.");
    tenantId = kcb.id;
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      const [lead, member] = await Promise.all([
        tx.user.create({ data: { tenantId, email: "q-zaldar@fixture.invalid", name: "Zaldar Fixturelead", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "q-yolanda@fixture.invalid", name: "Yolanda Fixturemember", status: "ACTIVE" } }),
      ]);
      leadId = lead.id;
      memberId = member.id;
      const project = await tx.project.create({
        data: { tenantId, code: "QACC-1", name: "Q Access Fixture", type: "Project", priority: "Medium", status: "Planning", leadUserId: lead.id },
      });
      projectId = project.id;
      await tx.projectMember.create({ data: { tenantId, projectId: project.id, userId: member.id, role: "Developer", allocationPct: 50 } });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
      await tx.user.deleteMany({ where: { id: { in: [leadId, memberId] } } });
    });
    await prisma.$disconnect();
  });

  const ctx = (userId: string, roles: string[]): TenantContext => ({ tenantId, userId, roles });

  it("reportableUserIds: Executive/SuperAdmin see everyone; PM sees their project members; Member sees only self", async () => {
    expect(await reportableUserIds(ctx("x", ["Executive"]))).toBe("all");
    expect(await reportableUserIds(ctx("x", ["PlatformSuperAdmin"]))).toBe("all");

    const pmSet = await reportableUserIds(ctx(leadId, ["ProjectManager"]));
    expect(pmSet).not.toBe("all");
    expect((pmSet as Set<string>).has(leadId)).toBe(true);
    expect((pmSet as Set<string>).has(memberId)).toBe(true); // member of the PM's project

    const memberSet = await reportableUserIds(ctx(memberId, ["Member"]));
    expect((memberSet as Set<string>).has(memberId)).toBe(true); // themselves
    expect((memberSet as Set<string>).has(leadId)).toBe(false); // NOT the lead
  });

  it("mock Q refuses another individual's workload for a Member, but returns it for an Executive", async () => {
    const asMember = await mockChat(ctx(memberId, ["Member"]), [{ role: "user", content: "what is Zaldar working on?" }]);
    expect(asMember.reply.toLowerCase()).toContain("can't share");
    expect(asMember.reply).toContain("Zaldar Fixturelead");

    const asExec = await mockChat(ctx("exec", ["Executive"]), [{ role: "user", content: "what is Zaldar working on?" }]);
    expect(asExec.reply.toLowerCase()).not.toContain("can't share");
  });
});

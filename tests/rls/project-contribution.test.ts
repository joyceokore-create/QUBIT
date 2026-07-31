// "Write risks/tasks only in a project you're part of" (per Joyce). Requires a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { canContributeToProject, canWriteTask, canWriteRisk, canWriteBlocker } from "@/lib/access";

describe("project contribution — members can write, non-members can't", () => {
  let tenantId: string;
  let memberId: string;
  let outsiderId: string;
  let projectId: string;
  let taskId: string;
  let riskId: string;
  let blockerId: string;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("project-contribution tests require seeded data — run `pnpm prisma:seed` first.");
    tenantId = kcb.id;
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      const [member, outsider] = await Promise.all([
        tx.user.create({ data: { tenantId, email: "contrib-member@fixture.invalid", name: "Contrib Member", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "contrib-outsider@fixture.invalid", name: "Contrib Outsider", status: "ACTIVE" } }),
      ]);
      memberId = member.id;
      outsiderId = outsider.id;
      const project = await tx.project.create({
        data: { tenantId, code: "CONTRIB-TEST-01", name: "Contribution Test", type: "Project", priority: "Med", status: "OnTrack" },
      });
      projectId = project.id;
      // The member is a plain "Developer" — NOT the lead, NOT a PM-role member.
      await tx.projectMember.create({ data: { tenantId, projectId, userId: memberId, role: "Developer" } });
      const [task, risk, blocker] = await Promise.all([
        tx.projectTask.create({ data: { tenantId, projectId, title: "Contrib task" } }),
        tx.risk.create({ data: { tenantId, projectId, title: "Contrib risk", probability: 3, impact: 3, status: "Open" } }),
        tx.blocker.create({ data: { tenantId, projectId, description: "Contrib blocker", severity: "Medium", status: "Open" } }),
      ]);
      taskId = task.id;
      riskId = risk.id;
      blockerId = blocker.id;
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      await tx.blocker.deleteMany({ where: { id: blockerId } });
      await tx.risk.deleteMany({ where: { id: riskId } });
      await tx.projectTask.deleteMany({ where: { id: taskId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
      await tx.user.deleteMany({ where: { id: { in: [memberId, outsiderId] } } });
    });
    await prisma.$disconnect();
  });

  const ctx = (userId: string, roles: string[]): TenantContext => ({ tenantId, userId, roles });

  it("a plain Member OF the project may contribute (risks/blockers) — but tasks are DM1.43-scoped", async () => {
    const member = ctx(memberId, ["Member"]);
    expect(await canContributeToProject(member, projectId)).toBe(true);
    // DM1.43 (supersedes member-writes-any): boards are read-only for non-PMs. A dev may
    // not edit a task that isn't theirs…
    expect(await canWriteTask(member, taskId)).toBe(false);
    // …but their OWN task stays writable (the personal-board flow).
    await withTenant({ tenantId, userId: "seed" }, (tx) =>
      tx.projectTask.update({ where: { id: taskId }, data: { assigneeId: memberId } }),
    );
    expect(await canWriteTask(member, taskId)).toBe(true);
    // Governance stays open to members: risks and blockers are theirs to raise.
    expect(await canWriteRisk(member, riskId)).toBe(true);
    expect(await canWriteBlocker(member, blockerId)).toBe(true);
  });

  it("a Member NOT part of the project is blocked from writing", async () => {
    const outsider = ctx(outsiderId, ["Member"]);
    expect(await canContributeToProject(outsider, projectId)).toBe(false);
    expect(await canWriteTask(outsider, taskId)).toBe(false);
    expect(await canWriteRisk(outsider, riskId)).toBe(false);
    expect(await canWriteBlocker(outsider, blockerId)).toBe(false);
  });

  it("a management role (ProjectManager) may write even when not a project member", async () => {
    const pm = ctx(outsiderId, ["ProjectManager"]);
    expect(await canContributeToProject(pm, projectId)).toBe(true);
    expect(await canWriteTask(pm, taskId)).toBe(true);
    expect(await canWriteRisk(pm, riskId)).toBe(true);
  });
});

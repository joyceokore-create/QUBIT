// M7-D (DM1.43) — role-scoped project boards, enforced at the SERVER. A dev receives
// their lane plus their own work and nothing else; PMs receive everything; the write rule
// (canWriteTask) refuses a member editing someone else's task while keeping the QA
// verification handoff alive. These run against the real database because the rule is a
// join between tasks and project memberships — exactly what a unit test would fake away.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { canWriteTask } from "@/lib/access";
import { taskVisibleTo } from "@/lib/board-lens";
import { memberCategoryByUser, viewerBoardCategory } from "@/server/board-scope";
import { listProjectTasks } from "@/server/project-tasks";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M7-D board scope", () => {
  let kcbId: string;
  let projectId: string;
  let leadId: string;
  let devId: string;
  let qaId: string;
  let implId: string;
  const asUser = (userId: string): TenantContext => ({ tenantId: kcbId, userId, roles: ["Member"] });
  const task: Record<string, string> = {};

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [lead, dev, qa, impl] = await createUsers(kcbId, 4, "scope");
    leadId = lead.id;
    devId = dev.id;
    qaId = qa.id;
    implId = impl.id;

    await withTenant(asUser(leadId), async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId, code: `BS${Date.now() % 100000}`, name: "Board Scope Fixture",
          type: "Project", priority: "High", status: "OnTrack", leadUserId: leadId,
        },
        select: { id: true },
      });
      projectId = project.id;
      await tx.projectMember.createMany({
        data: [
          { tenantId: kcbId, projectId, userId: devId, role: "Developer" },
          { tenantId: kcbId, projectId, userId: qaId, role: "QA Engineer" },
          { tenantId: kcbId, projectId, userId: implId, role: "Implementor" },
        ],
      });
      for (const [key, data] of [
        ["devWork", { title: "Build the export service", type: "Feature", assigneeId: devId }],
        ["qaWork", { title: "Verify the export service", type: "Feature", status: "InQA", assigneeId: qaId }],
        ["implWork", { title: "Train the branch staff", type: "Chore", assigneeId: implId }],
        ["triageBug", { title: "Unassigned defect", type: "Bug", severity: "High" }],
        ["pmWork", { title: "Steering pack", type: "Chore", assigneeId: leadId }],
      ] as const) {
        const t = await tx.projectTask.create({
          data: { tenantId: kcbId, projectId, ...data },
          select: { id: true },
        });
        task[key] = t.id;
      }
    });
  });

  afterAll(async () => {
    await withTenant(asUser(leadId), async (tx) => {
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("categorises each viewer from their membership; the lead is PM", async () => {
    expect(await viewerBoardCategory(asUser(leadId), projectId)).toBe("PM");
    expect(await viewerBoardCategory(asUser(devId), projectId)).toBe("Dev");
    expect(await viewerBoardCategory(asUser(qaId), projectId)).toBe("QA");
    expect(await viewerBoardCategory(asUser(implId), projectId)).toBe("Implementor");
  });

  it("a non-member is a stakeholder — whole picture, no write", async () => {
    const [outsider] = await createUsers(kcbId, 1, "scope-out");
    expect(await viewerBoardCategory(asUser(outsider.id), projectId)).toBe("Stakeholder");
  });

  it("board rows carry the assignee's category, lead included", async () => {
    const rows = await listProjectTasks(asUser(leadId), projectId);
    const byId = new Map(rows.map((r) => [r.id, r.assigneeCategory]));
    expect(byId.get(task.devWork)).toBe("Dev");
    expect(byId.get(task.qaWork)).toBe("QA");
    expect(byId.get(task.implWork)).toBe("Implementor");
    expect(byId.get(task.triageBug)).toBeNull();
    expect(byId.get(task.pmWork)).toBe("PM");
  });

  it("the dev wall: exactly the dev lane, applied the same way the API applies it", async () => {
    const category = await viewerBoardCategory(asUser(devId), projectId);
    const rows = await listProjectTasks(asUser(devId), projectId);
    const visible = rows.filter((t) => taskVisibleTo(category, devId, t)).map((t) => t.id);
    expect(visible).toContain(task.devWork);
    expect(visible).not.toContain(task.qaWork); // another discipline's lane
    expect(visible).not.toContain(task.implWork);
    expect(visible).not.toContain(task.triageBug); // unassigned bug → QA triage, not dev
    expect(visible).not.toContain(task.pmWork); // PM work lives on "all" only
  });

  it("the QA wall: their lane plus triage bugs", async () => {
    const category = await viewerBoardCategory(asUser(qaId), projectId);
    const rows = await listProjectTasks(asUser(qaId), projectId);
    const visible = rows.filter((t) => taskVisibleTo(category, qaId, t)).map((t) => t.id);
    expect(visible).toContain(task.qaWork);
    expect(visible).toContain(task.triageBug);
    expect(visible).not.toContain(task.devWork);
    expect(visible).not.toContain(task.implWork);
  });

  it("assigned-to-me overrides the wall", async () => {
    // Hand the implementor a QA-laned card; they must still see it.
    await withTenant(asUser(leadId), (tx) =>
      tx.projectTask.update({ where: { id: task.qaWork }, data: { assigneeId: implId } }),
    );
    const rows = await listProjectTasks(asUser(implId), projectId);
    const visible = rows.filter((t) => taskVisibleTo("Implementor", implId, t)).map((t) => t.id);
    expect(visible).toContain(task.qaWork);
    // Put it back for the write tests below.
    await withTenant(asUser(leadId), (tx) =>
      tx.projectTask.update({ where: { id: task.qaWork }, data: { assigneeId: qaId } }),
    );
  });

  it("write rule: a member may NOT edit someone else's task (supersedes member-writes-any)", async () => {
    expect(await canWriteTask(asUser(devId), task.implWork)).toBe(false);
    expect(await canWriteTask(asUser(implId), task.devWork)).toBe(false);
  });

  it("write rule: assignee, lead, and QA-in-scope keep their authority", async () => {
    expect(await canWriteTask(asUser(devId), task.devWork)).toBe(true); // own task
    expect(await canWriteTask(asUser(leadId), task.devWork)).toBe(true); // lead = PM
    // QA moves QA-scope work they don't own — the verification handoff (docs/18 §4)…
    expect(await canWriteTask(asUser(qaId), task.triageBug)).toBe(true); // Bug
    // …but has no authority over plain dev work.
    expect(await canWriteTask(asUser(qaId), task.devWork)).toBe(false);
  });

  it("memberCategoryByUser maps the whole team, lead as PM", async () => {
    const map = await memberCategoryByUser(asUser(leadId), projectId);
    expect(map.get(leadId)).toBe("PM");
    expect(map.get(devId)).toBe("Dev");
    expect(map.get(qaId)).toBe("QA");
    expect(map.get(implId)).toBe("Implementor");
  });
});

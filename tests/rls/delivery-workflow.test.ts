// Phase 6.2 — the generation/publish split and the delivery notifications. Needs a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { canContributeToProject, canWriteProject, canPublishTask } from "@/lib/access";
import { addTasks, listProjectTasks, listMyTasks, updateTask, flagTaskBlocked } from "@/server/project-tasks";
import { createProject } from "@/server/projects";

describe("delivery workflow (6.2) — publish gate + notifications", () => {
  let tenantId: string;
  let pmId: string; // project lead (PM member via createProject)
  let devId: string; // Developer member
  let qaId: string; // QA Engineer member (files bugs)
  let projectId: string;

  const ctx = (userId: string, roles: string[] = ["Member"]): TenantContext => ({ tenantId, userId, roles });

  beforeAll(async () => {
    const demoB = await prisma.tenant.findUnique({ where: { slug: "demo-b" } });
    if (!demoB) throw new Error("delivery-workflow tests require seeded data — run `pnpm prisma db seed` first.");
    tenantId = demoB.id;
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      const [pm, dev, qa] = await Promise.all([
        tx.user.create({ data: { tenantId, email: "dw-pm@fixture.invalid", name: "DW PM", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "dw-dev@fixture.invalid", name: "DW Dev", status: "ACTIVE" } }),
        tx.user.create({ data: { tenantId, email: "dw-qa@fixture.invalid", name: "DW QA", status: "ACTIVE" } }),
      ]);
      pmId = pm.id;
      devId = dev.id;
      qaId = qa.id;
    });
    const p = await createProject(ctx(pmId, ["ProjectManager"]), {
      code: `DW-${Date.now().toString().slice(-6)}`,
      name: "Delivery workflow test",
      type: "Project",
      priority: "Med",
      status: "OnTrack",
      leadUserId: pmId, // enrols the PM as a "Project Manager" member (DM1.17)
    });
    projectId = p.id;
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      await tx.projectMember.create({ data: { tenantId, projectId, userId: devId, role: "Developer" } });
      await tx.projectMember.create({ data: { tenantId, projectId, userId: qaId, role: "QA Engineer" } });
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId, userId: "seed" }, async (tx) => {
      await tx.notification.deleteMany({ where: { userId: { in: [pmId, devId, qaId] } } });
      await tx.blocker.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.projectTaskCounter.deleteMany({ where: { projectId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
      await tx.user.deleteMany({ where: { id: { in: [pmId, devId, qaId] } } });
    });
    await prisma.$disconnect();
  });

  it("splits generation from publishing: a Developer member contributes but cannot publish (DM1.15 №3)", async () => {
    expect(await canContributeToProject(ctx(devId), projectId)).toBe(true); // can generate/add
    expect(await canWriteProject(ctx(devId), projectId)).toBe(false); // cannot publish
    expect(await canWriteProject(ctx(pmId), projectId)).toBe(true); // the PM can

    await addTasks(ctx(devId), projectId, [{ title: "Draft from dev" }], { approvalStatus: "Draft" });
    const draft = (await listProjectTasks(ctx(devId), projectId)).find((t) => t.title === "Draft from dev")!;
    expect(await canPublishTask(ctx(devId), draft.id)).toBe(false);
    expect(await canPublishTask(ctx(pmId), draft.id)).toBe(true);
  });

  it("notifies the assignee when a Published task lands on them — but never for Drafts", async () => {
    await addTasks(ctx(pmId), projectId, [{ title: "Build the widget", assigneeId: devId }], { reporterId: pmId });
    await addTasks(ctx(pmId), projectId, [{ title: "Draft work", assigneeId: devId }], { approvalStatus: "Draft" });
    const notes = await withTenant(ctx(devId), (tx) =>
      tx.notification.findMany({ where: { userId: devId, kind: "task_assigned" } }),
    );
    expect(notes).toHaveLength(1); // the Draft assignment stays silent (§2.2)
    expect(notes[0].message).toContain("Build the widget");
    expect(notes[0].link).toMatch(/\?tab=Board&task=/); // deep-links to the highlighted card
  });

  it("surfaces the blocked reason on My Tasks (work-cycle UX)", async () => {
    const widget = (await listProjectTasks(ctx(devId), projectId)).find((t) => t.title === "Build the widget")!;
    await flagTaskBlocked(ctx(devId), widget.id, { description: "Waiting on API credentials" });
    const mine = await listMyTasks(ctx(devId), devId);
    const row = mine.find((t) => t.id === widget.id)!;
    expect(row.blocked).toBe(true);
    expect(row.blockedReason).toBe("Waiting on API credentials");
  });

  it("notifies on re-assignment via updateTask, and the bug reporter when it reaches In QA", async () => {
    // QA files a bug assigned to the dev (reporter = QA).
    await addTasks(ctx(qaId), projectId, [
      { title: "Save button crashes", type: "Bug", severity: "High", assigneeId: devId },
    ], { reporterId: qaId });
    const bug = (await listProjectTasks(ctx(qaId), projectId)).find((t) => t.title === "Save button crashes")!;

    // Dev moves it through the flow; hitting InQA notifies the REPORTER (QA closes bugs).
    await updateTask(ctx(devId), bug.id, { status: "InQA" });
    const qaNotes = await withTenant(ctx(qaId), (tx) =>
      tx.notification.findMany({ where: { userId: qaId, kind: "bug_ready_for_qa" } }),
    );
    expect(qaNotes).toHaveLength(1);
    expect(qaNotes[0].message).toContain("Save button crashes");

    // Re-assigning to a different person notifies them.
    await updateTask(ctx(pmId, ["ProjectManager"]), bug.id, { assigneeId: qaId });
    const reassigned = await withTenant(ctx(qaId), (tx) =>
      tx.notification.findMany({ where: { userId: qaId, kind: "task_assigned" } }),
    );
    expect(reassigned).toHaveLength(1);
  });

  it("validates a bug's parent task belongs to the same project", async () => {
    await expect(
      addTasks(ctx(qaId), projectId, [
        { title: "Orphan parent", type: "Bug", parentTaskId: "00000000-0000-4000-8000-000000000000" },
      ]),
    ).rejects.toThrow(/Parent task not found/);
    const parent = (await listProjectTasks(ctx(qaId), projectId)).find((t) => t.title === "Build the widget")!;
    await addTasks(ctx(qaId), projectId, [
      { title: "Found under widget", type: "Bug", parentTaskId: parent.id },
    ]);
    const bug = await withTenant(ctx(qaId), (tx) =>
      tx.projectTask.findFirst({ where: { projectId, title: "Found under widget" }, select: { parentTaskId: true } }),
    );
    expect(bug?.parentTaskId).toBe(parent.id);
  });
});

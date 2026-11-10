// UX6 — Member › My work and "Raise a blocker" (UX plan UX6). Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getMyWork } from "@/server/my-work";
import { flagTaskBlocked, TaskError } from "@/server/project-tasks";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("UX6 My work + raise a blocker", () => {
  let rbId: string;
  let bId: string;
  let member: TenantContext; // Riverbank Member, Developer on the project
  let pm: TenantContext; // Riverbank PM (project member with role "Project Manager")
  let outsider: TenantContext; // Riverbank user NOT on the project
  let bCtx: TenantContext;
  let projectId: string;
  let bProjectId: string;
  let taskA: string;
  let taskB: string;
  const now = new Date();
  const day = 86_400_000;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[m, p, o], [bu]] = await Promise.all([createUsers(rbId, 3, "mywork"), createUsers(bId, 1, "mywork")]);
    member = { tenantId: rbId, userId: m.id, roles: ["Member"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    outsider = { tenantId: rbId, userId: o.id, roles: ["Member"] };
    bCtx = { tenantId: bId, userId: bu.id, roles: ["Member"] };

    ({ projectId, taskA, taskB } = await withTenant(member, async (tx) => {
      const proj = await tx.project.create({
        data: { tenantId: rbId, code: "MYWA1", name: "My work fixture A", type: "Project", priority: "Med", status: "OnTrack" },
        select: { id: true },
      });
      await tx.projectMember.createMany({
        data: [
          { tenantId: rbId, projectId: proj.id, userId: m.id, role: "Developer" },
          { tenantId: rbId, projectId: proj.id, userId: p.id, role: "Project Manager" },
        ],
      });
      const a = await tx.projectTask.create({
        data: { tenantId: rbId, projectId: proj.id, title: "Fixture overdue task", assigneeId: m.id, dueDate: new Date(now.getTime() - 3 * day), status: "InProgress" },
        select: { id: true },
      });
      const bt = await tx.projectTask.create({
        data: { tenantId: rbId, projectId: proj.id, title: "Fixture later task", assigneeId: m.id, dueDate: new Date(now.getTime() + 20 * day), status: "NotStarted" },
        select: { id: true },
      });
      // Someone else's task on the same project, and a draft of mine: neither is "my work".
      await tx.projectTask.create({ data: { tenantId: rbId, projectId: proj.id, title: "Fixture PM task", assigneeId: p.id, status: "NotStarted" } });
      await tx.projectTask.create({ data: { tenantId: rbId, projectId: proj.id, title: "Fixture draft", assigneeId: m.id, status: "NotStarted", approvalStatus: "Draft" } });
      return { projectId: proj.id, taskA: a.id, taskB: bt.id };
    }));
    bProjectId = await withTenant(bCtx, async (tx) => {
      const proj = await tx.project.create({
        data: { tenantId: bId, code: "MYWB1", name: "My work fixture B", type: "Project", priority: "Med", status: "OnTrack" },
        select: { id: true },
      });
      await tx.projectTask.create({ data: { tenantId: bId, projectId: proj.id, title: "Fixture B task", assigneeId: bu.id, status: "NotStarted" } });
      return proj.id;
    });
  });

  afterAll(async () => {
    await withTenant(member, async (tx) => {
      await tx.notification.deleteMany({ where: { link: { contains: projectId } } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await withTenant(bCtx, (tx) => tx.project.deleteMany({ where: { id: bProjectId } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("lists only published tasks assigned to me, with my project role", async () => {
    const work = await getMyWork(member, now);
    expect(work.tasks.map((t) => t.title).sort()).toEqual(["Fixture later task", "Fixture overdue task"]);
    expect(work.tasks.every((t) => t.role === "Developer")).toBe(true);
    expect(work.projects.map((p) => p.name)).toEqual(["My work fixture A"]);
    // The PM is offered as someone who can unblock, and I'm not.
    const people = work.projects[0].people.map((p) => p.id);
    expect(people).toContain(pm.userId);
    expect(people).not.toContain(member.userId);
  });

  it("RLS: never shows another tenant's tasks, even with a spoofed user id", async () => {
    const work = await getMyWork({ ...bCtx, userId: member.userId }, now);
    expect(work.tasks).toEqual([]);
    expect(work.projects).toEqual([]);
  });

  it("refuses an unblocker who isn't on the project, and a start date in the future or too long ago", async () => {
    await expect(flagTaskBlocked(member, taskB, { description: "x", unblockerId: outsider.userId })).rejects.toBeInstanceOf(TaskError);
    await expect(flagTaskBlocked(member, taskB, { description: "x", since: new Date(now.getTime() + day) }, now)).rejects.toThrow(/future/);
    await expect(flagTaskBlocked(member, taskB, { description: "x", since: new Date(now.getTime() - 91 * day) }, now)).rejects.toThrow(/90 days/);
  });

  it("raises a blocker: raiser, unblocker, start date, audit row, and the PM is told", async () => {
    const since = new Date(now.getTime() - 2 * day);
    const blocker = await flagTaskBlocked(member, taskA, { description: "Waiting on synthetic vendor data", unblockerId: pm.userId, since }, now);
    expect(blocker).toMatchObject({ raisedById: member.userId, ownerId: pm.userId, status: "Open", taskId: taskA });
    expect(blocker.dateRaised.getTime()).toBe(since.getTime());

    const [auditRow, notes] = await withTenant(member, (tx) =>
      Promise.all([
        tx.auditLog.findFirst({ where: { entityType: "blocker", entityId: blocker.id, action: "create" } }),
        tx.notification.findMany({ where: { kind: "blocker.opened", link: { contains: taskA } }, select: { userId: true, message: true } }),
      ]),
    );
    expect(auditRow?.actorId).toBe(member.userId);
    // The PM (who is also the chosen unblocker) gets one notification; the raiser gets none.
    expect(notes.map((n) => n.userId)).toEqual([pm.userId]);
    expect(notes[0].message).toMatch(/needs you to unblock/);
    // The notification never carries the free-text reason.
    expect(notes[0].message).not.toMatch(/synthetic vendor data/);

    const work = await getMyWork(member, now);
    expect(work.tasks.find((t) => t.id === taskA)?.blocker).toMatchObject({ description: "Waiting on synthetic vendor data" });
    expect(work.blockers.map((b) => b.id)).toEqual([blocker.id]);
  });

  it("machine-raised blockers keep the old rules: no raiser, nobody notified", async () => {
    const blocker = await flagTaskBlocked(member, taskB, { description: "commit #blocked", ownerId: null });
    expect(blocker.raisedById).toBeNull();
    expect(blocker.ownerId).toBeNull();
    const notes = await withTenant(member, (tx) => tx.notification.count({ where: { link: { contains: taskB } } }));
    expect(notes).toBe(0);
  });
});

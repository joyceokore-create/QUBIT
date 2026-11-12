// Milestone A (docs handoff §1.5) — the PM nudges a blocked task's assignee: the task
// records lastNudgedAt, the assignee gets the bell (and, when email is on and their
// channel allows, the email — with the notification stamped so the digest never re-sends),
// an audit row and a task.nudged event exist, one nudge per 24h, tracker-only assignees
// are refused with a reason, and nothing crosses a tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { flagTaskBlocked, listProjectTasks, nudgeTask } from "@/server/project-tasks";
import { setMyPreference } from "@/server/mail/preferences";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2027-11-24T10:00:00.000Z");
const HOUR = 3_600_000;

describe("Milestone A — task nudge", () => {
  let rbId: string;
  let dbId: string;
  let pmCtx: TenantContext;
  let devCtx: TenantContext;
  let projectId: string;
  let blockedTask: string; // assigned to the fixture dev, blocked
  let externalTask: string; // tracker-only assignee, blocked
  let openTask: string; // assigned, NOT blocked
  let inAppTask: string; // assigned, blocked — for the InApp preference case

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, dev] = await createUsers(rbId, 2, "ndg");
    pmCtx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    devCtx = { tenantId: rbId, userId: dev.id, roles: ["Member"] };
    await withTenant(pmCtx, async (tx) => {
      projectId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "NDG1", name: "nudge fixture", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pm.id },
          select: { id: true },
        })
      ).id;
      await tx.projectMember.create({ data: { tenantId: rbId, projectId, userId: dev.id, role: "Developer" } });
      const mk = (title: string, extra: Record<string, unknown> = {}) =>
        tx.projectTask.create({
          data: { tenantId: rbId, projectId, title, type: "Chore", priority: "Med", status: "InProgress", approvalStatus: "Published", ...extra },
          select: { id: true },
        });
      blockedTask = (await mk("nudge fixture blocked", { assigneeId: dev.id })).id;
      externalTask = (
        await mk("nudge fixture external", {
          sourceSystem: "youtrack",
          externalId: "ndg-ext-1",
          externalKey: "YT-NDG1",
          externalUrl: "https://yt.example.invalid/issue/YT-NDG1",
          externalAssigneeName: "Ext QA",
        })
      ).id;
      openTask = (await mk("nudge fixture open", { assigneeId: dev.id })).id;
      inAppTask = (await mk("nudge fixture in-app", { assigneeId: dev.id })).id;
    });
    await flagTaskBlocked(pmCtx, blockedTask, { description: "KYC sandbox unavailable" });
    await flagTaskBlocked(pmCtx, externalTask, { description: "UAT data refresh" });
    await flagTaskBlocked(pmCtx, inAppTask, { description: "Waiting on vendor" });
  });

  afterAll(async () => {
    await withTenant(pmCtx, async (tx) => {
      const taskIds = [blockedTask, externalTask, openTask, inAppTask];
      await tx.notificationPreference.deleteMany({ where: { userId: devCtx.userId } });
      await tx.domainEvent.deleteMany({ where: { payload: { path: ["projectId"], equals: projectId } } });
      await tx.auditLog.deleteMany({ where: { entityType: "project_task", entityId: { in: taskIds } } });
      const blockerIds = (await tx.blocker.findMany({ where: { projectId }, select: { id: true } })).map((b) => b.id);
      await tx.auditLog.deleteMany({ where: { entityType: "blocker", entityId: { in: blockerIds } } });
      await tx.blocker.deleteMany({ where: { projectId } });
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.projectMember.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId); // also drops the dev's nudge notifications
    await prisma.$disconnect();
  });

  it("records the nudge, rings the assignee's bell, audits it, and exposes age + stamp on the board row", async () => {
    const result = await nudgeTask(pmCtx, blockedTask, NOW);
    expect(result.assigneeId).toBe(devCtx.userId);
    expect(result.lastNudgedAt.getTime()).toBe(NOW.getTime());
    expect(["Email", "Digest", "InApp"]).toContain(result.channel);

    const link = `/projects/${projectId}?tab=Board&task=${blockedTask}`;
    const [bell, auditRow, event] = await withTenant(pmCtx, (tx) =>
      Promise.all([
        tx.notification.findFirst({ where: { userId: devCtx.userId, kind: "nudge", link } }),
        tx.auditLog.findFirst({ where: { entityType: "project_task", entityId: blockedTask }, orderBy: { createdAt: "desc" } }),
        tx.domainEvent.findFirst({ where: { type: "task.nudged", entityId: blockedTask } }),
      ]),
    );
    expect(bell?.message).toContain("KYC sandbox unavailable");
    // The digest must never re-send what already left: stamped iff mail actually went out.
    if (result.emailed) expect(bell?.emailedAt).not.toBeNull();
    else expect(bell?.emailedAt).toBeNull();
    expect(auditRow?.after).toMatchObject({ nudgedUserId: devCtx.userId });
    expect(event).not.toBeNull();

    const row = (await listProjectTasks(pmCtx, projectId)).find((t) => t.id === blockedTask)!;
    expect(row.lastNudgedAt?.getTime()).toBe(NOW.getTime());
    expect(row.blockedSince).not.toBeNull();
    expect(row.blocked).toBe(true);
  });

  it("nothing crosses tenants: demo-b sees no such task, and the riverbank row is untouched", async () => {
    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["ProjectManager"] };
    await expect(nudgeTask(other, blockedTask, new Date(NOW.getTime() + 48 * HOUR))).rejects.toMatchObject({ code: "NOT_FOUND" });
    const row = await withTenant(pmCtx, (tx) => tx.projectTask.findUnique({ where: { id: blockedTask }, select: { lastNudgedAt: true } }));
    expect(row?.lastNudgedAt?.getTime()).toBe(NOW.getTime());
  });

  it("one nudge per 24 hours", async () => {
    await expect(nudgeTask(pmCtx, blockedTask, new Date(NOW.getTime() + HOUR))).rejects.toMatchObject({ code: "ALREADY_NUDGED" });
    const later = await nudgeTask(pmCtx, blockedTask, new Date(NOW.getTime() + 25 * HOUR));
    expect(later.lastNudgedAt.getTime()).toBe(NOW.getTime() + 25 * HOUR);
  });

  it("refuses a tracker-only assignee (no address we hold) and an unblocked task, saying why", async () => {
    await expect(nudgeTask(pmCtx, externalTask, NOW)).rejects.toMatchObject({ code: "BAD_INPUT", message: expect.stringContaining("Ext QA") });
    await expect(nudgeTask(pmCtx, openTask, NOW)).rejects.toMatchObject({ code: "BAD_INPUT" });
  });

  it("respects the assignee's channel: InApp means the bell only, nothing stamped as emailed", async () => {
    await setMyPreference(devCtx, { kind: "nudge", channel: "InApp" });
    const result = await nudgeTask(pmCtx, inAppTask, NOW);
    expect(result.channel).toBe("InApp");
    expect(result.emailed).toBe(false);
    const bell = await withTenant(pmCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: devCtx.userId, kind: "nudge", link: `/projects/${projectId}?tab=Board&task=${inAppTask}` } }),
    );
    expect(bell).not.toBeNull();
    expect(bell?.emailedAt).toBeNull();
  });
});

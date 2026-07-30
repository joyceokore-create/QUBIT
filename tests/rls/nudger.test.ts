// M3 nudger end-to-end: matrix signals fire, weekly dedupe holds, escalation bumps the
// level (never duplicates), snooze silences one person only, checkin-chase chases last
// week's unconfirmed drafts, and everything stays tenant-isolated.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { listMyNudges, snoozeNudge, SnoozeError } from "@/server/nudger";
import { runJob } from "@/server/jobs";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

const KEY_PREFIX = `nudger-test-${process.pid}`;
let keySeq = 0;
const nextKey = () => `${KEY_PREFIX}:${++keySeq}`;
const WEEK = isoWeekId(new Date());
const day = 86_400_000;

describe("M3 nudger", () => {
  let kcbId: string;
  let riverbankId: string;
  let leadId: string;
  let devId: string;
  let projectId: string;
  let overdueTaskId: string;
  let freshTaskId: string;
  let blockerId: string;
  let devCtx: TenantContext;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    const [lead, dev] = await ensureUsers(kcbId, 2);
    leadId = lead.id;
    devId = dev.id;
    devCtx = { tenantId: kcbId, userId: devId, roles: ["Member"] };

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      // Since M6-A the nudger skips people on leave and reroutes to the PM, so this
      // suite must control that precondition: any absence on its actors (ensureUsers
      // reuses seeded accounts, which other work may have booked off) would silently
      // change who gets nudged.
      await tx.absence.deleteMany({ where: { userId: { in: [leadId, devId] } } });
    });

    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      const project = await tx.project.create({
        data: {
          tenantId: kcbId,
          code: `NDG${Date.now() % 100000}`,
          name: "Nudger Fixture",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          leadUserId: leadId,
        },
      });
      projectId = project.id;
      const now = Date.now();
      const overdue = await tx.projectTask.create({
        data: {
          tenantId: kcbId,
          projectId,
          title: "Ship the export service",
          status: "InProgress",
          approvalStatus: "Published",
          assigneeId: devId,
          dueDate: new Date(now - 5 * day), // 5d overdue → creates straight at level 1
          lastActivityAt: new Date(now),
        },
      });
      overdueTaskId = overdue.id;
      const fresh = await tx.projectTask.create({
        data: {
          tenantId: kcbId,
          projectId,
          title: "Write the runbook",
          status: "InProgress",
          approvalStatus: "Published",
          assigneeId: devId,
          dueDate: new Date(now + 12 * 3_600_000), // due in 12h → level 0
          lastActivityAt: new Date(now),
        },
      });
      freshTaskId = fresh.id;
      const blocker = await tx.blocker.create({
        data: {
          tenantId: kcbId,
          projectId,
          description: "Waiting on network firewall change",
          severity: "Critical",
          status: "Open",
          ownerId: devId,
          createdAt: new Date(now - 8 * day), // 8d open → level 2, heads pulled in
        },
      });
      blockerId = blocker.id;
    });
  });

  afterAll(async () => {
    for (const tenantId of [kcbId, riverbankId]) {
      await withTenant({ tenantId, userId: "test" }, async (tx) => {
        await tx.nudge.deleteMany({ where: { isoWeek: WEEK } });
        await tx.nudgeSnooze.deleteMany({});
        await tx.notification.deleteMany({ where: { kind: "nudge" } });
        await tx.domainEvent.deleteMany({ where: { type: { in: ["nudge.created", "nudge.escalated"] } } });
        await tx.auditLog.deleteMany({ where: { entityType: "nudge" } });
        await tx.checkIn.deleteMany({ where: { project: { name: "Nudger Fixture" } } });
      });
    }
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) => tx.project.deleteMany({ where: { id: projectId } }));
    await prisma.jobRun.deleteMany({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("fires the matrix: overdue→level 1, due-soon→level 0, old blocker→level 2 with heads", async () => {
    const result = await runJob("nudger", nextKey());
    expect(result.status).toBe("Succeeded");

    const rows = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.nudge.findMany({ where: { projectId } }),
    );
    const byEntity = new Map(rows.map((r) => [`${r.entityId}:${r.signal}`, r]));

    const overdueNudge = byEntity.get(`${overdueTaskId}:task_due`);
    expect(overdueNudge?.escalationLevel).toBe(1); // >2d overdue creates escalated
    expect(overdueNudge?.recipientIds).toEqual(expect.arrayContaining([devId, leadId]));

    const dueSoon = byEntity.get(`${freshTaskId}:task_due`);
    expect(dueSoon?.escalationLevel).toBe(0);
    expect(dueSoon?.recipientIds).toEqual([devId]);

    const blockerNudge = byEntity.get(`${blockerId}:blocker_open`);
    expect(blockerNudge?.escalationLevel).toBe(2);
    // Owner + PM + every HeadOfProjects in the tenant.
    expect(blockerNudge?.recipientIds).toEqual(expect.arrayContaining([devId, leadId]));

    const note = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: devId, kind: "nudge", message: { contains: "Ship the export service" } } }),
    );
    expect(note).not.toBeNull();
  });

  it("dedupes within the week: a second run adds nothing and re-pings nobody", async () => {
    const before = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      Promise.all([tx.nudge.count({ where: { projectId } }), tx.notification.count({ where: { kind: "nudge" } })]),
    );
    const result = await runJob("nudger", nextKey());
    expect(result.status).toBe("Succeeded");
    const after = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      Promise.all([tx.nudge.count({ where: { projectId } }), tx.notification.count({ where: { kind: "nudge" } })]),
    );
    expect(after).toEqual(before);
  });

  it("escalates in place when a level-0 fact worsens — no duplicate row", async () => {
    // The due-soon task slips to 4 days overdue.
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.projectTask.update({ where: { id: freshTaskId }, data: { dueDate: new Date(Date.now() - 4 * day) } }),
    );
    const result = await runJob("nudger", nextKey());
    expect(result.status).toBe("Succeeded");

    const rows = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.nudge.findMany({ where: { entityId: freshTaskId, signal: "task_due" } }),
    );
    expect(rows).toHaveLength(1); // escalation bumps the level, never duplicates
    expect(rows[0].escalationLevel).toBe(1);
    expect(rows[0].recipientIds).toEqual(expect.arrayContaining([devId, leadId]));

    // Only the newly-pulled-in PM gets the escalation ping.
    const escalationNote = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findFirst({ where: { userId: leadId, kind: "nudge", message: { startsWith: "Escalated:" } } }),
    );
    expect(escalationNote?.message).toContain("Write the runbook");
  });

  it("lists the viewer's nudges most-severe first and honours snooze for that viewer only", async () => {
    const mineBefore = await listMyNudges(devCtx);
    expect(mineBefore.length).toBeGreaterThanOrEqual(3);
    expect(mineBefore[0].escalationLevel).toBeGreaterThanOrEqual(mineBefore[mineBefore.length - 1].escalationLevel);

    const target = mineBefore.find((n) => n.entityId === overdueTaskId)!;
    const { until } = await snoozeNudge(devCtx, target.id, 7);
    expect(until.getTime()).toBeGreaterThan(Date.now());

    const mineAfter = await listMyNudges(devCtx);
    expect(mineAfter.find((n) => n.entityId === overdueTaskId)).toBeUndefined();

    // The lead still sees it — snooze is personal.
    const leadView = await listMyNudges({ tenantId: kcbId, userId: leadId, roles: ["Member"] });
    expect(leadView.find((n) => n.entityId === overdueTaskId)).toBeDefined();
  });

  it("rejects snoozing someone else's nudge", async () => {
    const leadView = await listMyNudges({ tenantId: kcbId, userId: leadId, roles: ["Member"] });
    const notMine = leadView.find((n) => n.entityId === blockerId)!;
    const stranger = { tenantId: kcbId, userId: "00000000-0000-0000-0000-000000000000", roles: ["Member"] };
    await expect(snoozeNudge(stranger, notMine.id)).rejects.toThrow(SnoozeError);
  });

  it("checkin-chase nudges the PM about last week's unconfirmed check-in", async () => {
    const prevWeek = isoWeekId(new Date(Date.now() - 7 * day));
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.checkIn.create({
        data: { tenantId: kcbId, projectId, isoWeek: prevWeek, status: "Draft", computedRag: "Amber", draft: { lines: [] } },
      }),
    );
    const result = await runJob("checkin-chase", nextKey());
    expect(result.status).toBe("Succeeded");

    const row = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.nudge.findFirst({ where: { signal: "checkin_unconfirmed", projectId } }),
    );
    expect(row?.recipientIds).toContain(leadId);
    expect(row?.message).toContain("Nudger Fixture");
  });

  it("keeps nudges tenant-isolated", async () => {
    const cross = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.nudge.findMany({ where: { projectId } }),
    );
    expect(cross).toHaveLength(0);
    const unscoped = await prisma.nudge.findMany({ take: 1 });
    expect(unscoped).toHaveLength(0);
  });
});

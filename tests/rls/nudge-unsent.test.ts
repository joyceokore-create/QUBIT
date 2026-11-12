// Milestone B — the Head's "Nudge all": only projects with no CONFIRMED + SENT status
// update this week are chased, the lead and every PM member get the bell, one audit row
// names the Head, a second press the same week is a no-op, a PM may not press it, and
// nothing crosses a tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { confirmCheckIn } from "@/server/checkins";
import { nudgeUnsentCheckins } from "@/server/nudger";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2028-07-19T12:00:00.000Z");
const W = isoWeekId(NOW);

describe("Milestone B — nudge unsent status updates", () => {
  let rbId: string;
  let dbId: string;
  let headCtx: TenantContext;
  let pmACtx: TenantContext;
  let pmB: string;
  let pmC: string;
  let a: string; // sent this week
  let b: string; // nothing this week
  let c: string; // Completed — never chased

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [head, pmA, b1, c1] = await createUsers(rbId, 4, "nu");
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"], permissions: ["reports:read"] };
    pmACtx = { tenantId: rbId, userId: pmA.id, roles: ["ProjectManager"] };
    pmB = b1.id;
    pmC = c1.id;
    await withTenant(headCtx, async (tx) => {
      await tx.roleAssignment.create({ data: { tenantId: rbId, userId: head.id, role: "HeadOfProjects" } });
      const mk = (code: string, name: string, extra: Record<string, unknown>) =>
        tx.project.create({ data: { tenantId: rbId, code, name, type: "Project", priority: "Med", status: "OnTrack", ...extra }, select: { id: true } });
      a = (await mk("NU1", "nudge sent", { leadUserId: pmA.id })).id;
      b = (await mk("NU2", "nudge missing", { leadUserId: pmB })).id;
      c = (await mk("NU3", "nudge done", { leadUserId: pmA.id, status: "Completed" })).id;
      await tx.projectMember.create({ data: { tenantId: rbId, projectId: b, userId: pmC, role: "Project Manager" } });
    });
    await confirmCheckIn(pmACtx, a, { narrative: "sent already" }, NOW);
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      const ids = [a, b, c];
      const nudges = await tx.nudge.findMany({ where: { entityId: { in: ids } }, select: { id: true } });
      await tx.domainEvent.deleteMany({ where: { entityType: "nudge", entityId: { in: nudges.map((n) => n.id) } } });
      await tx.nudge.deleteMany({ where: { entityId: { in: ids } } });
      await tx.auditLog.deleteMany({ where: { entityType: "nudge", entityId: W } });
      const checkIns = await tx.checkIn.findMany({ where: { projectId: { in: ids } }, select: { id: true } });
      await tx.domainEvent.deleteMany({ where: { entityType: "check_in", entityId: { in: checkIns.map((x) => x.id) } } });
      await tx.auditLog.deleteMany({ where: { entityType: "check_in", entityId: { in: checkIns.map((x) => x.id) } } });
      await tx.notification.deleteMany({ where: { kind: "checkin.submitted_to_head", message: { contains: "NU1" } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: ids } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: ids } } });
      await tx.project.deleteMany({ where: { id: { in: ids } } });
      await tx.roleAssignment.deleteMany({ where: { userId: headCtx.userId } });
    });
    // The isolation case ran the chase in demo-b too — clear what it created there.
    await withTenant({ tenantId: dbId, userId: "test" }, async (tx) => {
      const nudges = await tx.nudge.findMany({ where: { isoWeek: W, signal: "checkin_unsent" }, select: { id: true } });
      await tx.domainEvent.deleteMany({ where: { entityType: "nudge", entityId: { in: nudges.map((n) => n.id) } } });
      await tx.notification.deleteMany({ where: { kind: "nudge", message: { contains: `Week ${W.split("-W")[1]} status update not sent` } } });
      await tx.nudge.deleteMany({ where: { isoWeek: W, signal: "checkin_unsent" } });
      await tx.auditLog.deleteMany({ where: { entityType: "nudge", entityId: W } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("chases only the project with nothing sent, rings its lead and PM member, and audits the Head", async () => {
    const r = await nudgeUnsentCheckins(headCtx, NOW);
    const mine = await withTenant(headCtx, (tx) => tx.nudge.findMany({ where: { entityId: { in: [a, b, c] } } }));
    expect(mine.map((n) => n.entityId)).toEqual([b]);
    expect(r.targeted).toBeGreaterThanOrEqual(1);
    expect(r.created).toBeGreaterThanOrEqual(1);
    const n = mine[0]!;
    expect(n.signal).toBe("checkin_unsent");
    expect(n.link).toBe(`/projects/${b}?tab=This%20week`);
    expect(n.recipientIds).toEqual(expect.arrayContaining([pmB, pmC]));
    const [bells, auditRow] = await withTenant(headCtx, (tx) =>
      Promise.all([
        tx.notification.findMany({ where: { kind: "nudge", userId: { in: [pmB, pmC] }, message: { contains: "NU2" } }, select: { userId: true } }),
        tx.auditLog.findFirst({ where: { entityType: "nudge", entityId: W, actorId: headCtx.userId } }),
      ]),
    );
    expect(new Set(bells.map((x) => x.userId))).toEqual(new Set([pmB, pmC]));
    expect(auditRow).not.toBeNull();
  });

  it("a second press the same week is a no-op, and one project can be nudged alone", async () => {
    const again = await nudgeUnsentCheckins(headCtx, NOW, { projectId: b });
    expect(again).toMatchObject({ targeted: 1, created: 0, skipped: 1 });
    const sent = await nudgeUnsentCheckins(headCtx, NOW, { projectId: a });
    expect(sent.targeted).toBe(0); // already in — nothing to chase
    const count = await withTenant(headCtx, (tx) => tx.nudge.count({ where: { entityId: b } }));
    expect(count).toBe(1);
  });

  it("is the Head's to do — a PM is refused", async () => {
    await expect(nudgeUnsentCheckins(pmACtx, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("nothing crosses tenants: demo-b's Head cannot target a riverbank project, and chasing their own estate leaves riverbank alone", async () => {
    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["HeadOfProjects"], permissions: ["reports:read"] };
    await expect(nudgeUnsentCheckins(other, NOW, { projectId: b })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await nudgeUnsentCheckins(other, NOW);
    const count = await withTenant(headCtx, (tx) => tx.nudge.count({ where: { entityId: b } }));
    expect(count).toBe(1);
  });
});

// Risks and issues a status report lists become RAID records only when the PM picks them on
// the card: a risk (rated 3×3 for the PM to adjust) or a blocker (Medium). Re-saving never
// duplicates an open one; a project the PM doesn't run is refused; every record is audited;
// nothing crosses a tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { applyStatusReport } from "@/server/status-report-upload";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-10-07T10:00:00Z");

describe("status-report upload — risks and blockers from the file", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let other: TenantContext;
  let mine: string;
  let theirs: string;
  let foreign: string;
  const users: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [a, b] = await createUsers(rbId, 2, "rdx");
    users.push(a.id, b.id);
    pm = { tenantId: rbId, userId: a.id, roles: ["ProjectManager"] };
    other = { tenantId: rbId, userId: b.id, roles: ["ProjectManager"] };
    const mk = (tenantId: string, code: string, lead: string | null) =>
      withTenant({ tenantId, userId: "seed" }, (tx) => tx.project.create({ data: { tenantId, code, name: `Raid ${code}`, type: "Project", priority: "Med", status: "OnTrack", leadUserId: lead }, select: { id: true } })).then((x) => x.id);
    mine = await mk(rbId, "RDX-A", pm.userId);
    theirs = await mk(rbId, "RDX-B", other.userId);
    foreign = await mk(dbId, "RDX-X", null);
  });

  afterAll(async () => {
    await withTenant({ tenantId: rbId, userId: "seed" }, async (tx) => {
      const blockerIds = (await tx.blocker.findMany({ where: { projectId: { in: [mine, theirs] } }, select: { id: true } })).map((b) => b.id);
      await tx.domainEvent.deleteMany({ where: { entityId: { in: blockerIds } } });
      await tx.risk.deleteMany({ where: { projectId: { in: [mine, theirs] } } });
      await tx.blocker.deleteMany({ where: { projectId: { in: [mine, theirs] } } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await tx.project.deleteMany({ where: { id: { in: [mine, theirs] } } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreign } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  const raid = [
    { kind: "risk" as const, text: "Pilot date at risk if devices slip again" },
    { kind: "blocker" as const, text: "Hardware vendor has not delivered the devices" },
  ];

  it("raises the picked lines on the PM's project, audited, and only once", async () => {
    const [first] = await applyStatusReport(pm, { rows: [{ projectId: mine, raid }] }, NOW);
    expect(first).toMatchObject({ outcome: "none", raid: "1 risk and 1 blocker raised" });
    const [again] = await applyStatusReport(pm, { rows: [{ projectId: mine, raid: [...raid, { kind: "risk", text: "Budget overrun on licences" }] }] }, NOW);
    expect(again!.raid).toBe("1 risk raised (2 already open)");

    const rows = await withTenant(pm, async (tx) => ({
      risks: await tx.risk.findMany({ where: { projectId: mine }, select: { title: true, probability: true, impact: true, status: true, mitigation: true }, orderBy: { title: "asc" } }),
      blockers: await tx.blocker.findMany({ where: { projectId: mine }, select: { description: true, severity: true, status: true } }),
      audits: await tx.auditLog.count({ where: { actorId: pm.userId, entityType: { in: ["risk", "blocker"] }, action: "create" } }),
    }));
    expect(rows.risks).toHaveLength(2);
    expect(rows.risks[1]).toMatchObject({ title: "Pilot date at risk if devices slip again", probability: 3, impact: 3, status: "Open" });
    expect(rows.risks[1]!.mitigation).toMatch(/week 41 status report/);
    expect(rows.blockers).toEqual([{ description: "Hardware vendor has not delivered the devices", severity: "Medium", status: "Open" }]);
    expect(rows.audits).toBe(3);
  });

  it("refuses a project the PM doesn't run, and never reaches another tenant", async () => {
    const [notMine, cross] = await applyStatusReport(pm, { rows: [{ projectId: theirs, raid }, { projectId: foreign, raid }] }, NOW);
    expect(notMine).toMatchObject({ outcome: "error", message: "You don't run this project." });
    expect(cross).toMatchObject({ outcome: "error", message: "No such project." });
    expect(await withTenant(pm, (tx) => tx.risk.count({ where: { projectId: theirs } }))).toBe(0);
    expect(await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.risk.count({ where: { projectId: foreign } }))).toBe(0);
  });

  it("refuses lines that are too short or too long", async () => {
    await expect(applyStatusReport(pm, { rows: [{ projectId: mine, raid: [{ kind: "risk", text: "x" }] }] }, NOW)).rejects.toThrow();
    await expect(applyStatusReport(pm, { rows: [{ projectId: mine, raid: [{ kind: "risk", text: "y".repeat(201) }] }] }, NOW)).rejects.toThrow();
  });
});

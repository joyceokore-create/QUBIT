// Milestone B — the /reports read model: PM rows scoped to the projects you run, the
// Head's portfolio-grouped inbox with counts, the executive's 8-week grid (a signed
// override read at that week's END stays signed), tiles, decision blockers, the
// permission gate, and tenant isolation. Far-future week so no live suite collides.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId, isoWeekMonday, shiftIsoWeek } from "@/lib/iso-week";
import { getReportsWeek } from "@/server/reports-week";
import { approveRollup } from "@/server/portfolio-reports";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2028-04-26T12:00:00.000Z");
const W = isoWeekId(NOW); // 2028-W17
const W1 = shiftIsoWeek(W, -1);
const W2 = shiftIsoWeek(W, -2);
const W3 = shiftIsoWeek(W, -3);
const DAY = 86_400_000;

describe("Milestone B — reports week read model", () => {
  let rbId: string;
  let dbId: string;
  let pmCtx: TenantContext;
  let pmMemberCtx: TenantContext;
  let headCtx: TenantContext;
  let execCtx: TenantContext;
  let memberCtx: TenantContext;
  let p1: string;
  let p2: string;
  let p3: string;
  let p4: string;
  const portfolioIds: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, pmMember, head, exec, member] = await createUsers(rbId, 5, "rw");
    pmCtx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    pmMemberCtx = { tenantId: rbId, userId: pmMember.id, roles: ["ProjectManager"] };
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"], permissions: ["reports:read"] };
    execCtx = { tenantId: rbId, userId: exec.id, roles: ["Executive"], permissions: ["reports:read"] };
    memberCtx = { tenantId: rbId, userId: member.id, roles: ["Member"] };
    await withTenant(headCtx, async (tx) => {
      await tx.roleAssignment.createMany({
        data: [
          { tenantId: rbId, userId: head.id, role: "HeadOfProjects" },
          { tenantId: rbId, userId: exec.id, role: "Executive" },
        ],
      });
      const alpha = await tx.portfolio.create({ data: { tenantId: rbId, name: "RW Alpha" }, select: { id: true } });
      const beta = await tx.portfolio.create({ data: { tenantId: rbId, name: "RW Beta" }, select: { id: true } });
      portfolioIds.push(alpha.id, beta.id);
      const mk = (code: string, name: string, extra: Record<string, unknown>) =>
        tx.project.create({
          data: { tenantId: rbId, code, name, type: "Project", priority: "Med", status: "OnTrack", ...extra },
          select: { id: true },
        });
      p1 = (await mk("RW1", "rw one", { leadUserId: pm.id, portfolioId: alpha.id })).id;
      p2 = (await mk("RW2", "rw two", { leadUserId: head.id, portfolioId: beta.id })).id;
      p3 = (await mk("RW3", "rw three", { leadUserId: head.id })).id;
      p4 = (await mk("RW4", "rw four", { leadUserId: pm.id, status: "Completed" })).id;
      await tx.projectMember.create({ data: { tenantId: rbId, projectId: p2, userId: pmMember.id, role: "Project Manager" } });

      // P1 this week: confirmed AND sent. P2 this week: a Draft. P1 two weeks ago: a Red
      // override that expired the following week (so "as signed" ≠ "as of today").
      const w2Confirmed = new Date(isoWeekMonday(W2).getTime() + DAY);
      await tx.checkIn.createMany({
        data: [
          { tenantId: rbId, projectId: p1, isoWeek: W, status: "Confirmed", computedRag: "Green", draft: { lines: ["l1"] }, narrative: "p1 line", confirmedById: pm.id, confirmedAt: NOW, submittedToHeadAt: NOW },
          { tenantId: rbId, projectId: p2, isoWeek: W, status: "Draft", computedRag: "Amber", draft: { lines: ["d1"] } },
          { tenantId: rbId, projectId: p1, isoWeek: W2, status: "Confirmed", computedRag: "Green", draft: {}, narrative: "old red week", ragOverride: "Red", overrideReason: "vendor outage", overrideExpiresAt: new Date(w2Confirmed.getTime() + 7 * DAY), confirmedById: pm.id, confirmedAt: w2Confirmed, submittedToHeadAt: w2Confirmed },
        ],
      });
      await tx.blocker.createMany({
        data: [
          { tenantId: rbId, projectId: p3, description: "rw critical", severity: "Critical", status: "Open", dateRaised: new Date(NOW.getTime() - DAY) },
          { tenantId: rbId, projectId: p1, description: "rw old medium", severity: "Medium", status: "Open", dateRaised: new Date(NOW.getTime() - 10 * DAY) },
          { tenantId: rbId, projectId: p2, description: "rw fresh low", severity: "Low", status: "Open", dateRaised: new Date(NOW.getTime() - DAY) },
        ],
      });
    });
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      const ids = [p1, p2, p3, p4];
      const report = await tx.portfolioReport.findUnique({ where: { tenantId_isoWeek: { tenantId: rbId, isoWeek: W } }, select: { id: true } });
      if (report) {
        await tx.domainEvent.deleteMany({ where: { entityType: "portfolio_report", entityId: report.id } });
        await tx.auditLog.deleteMany({ where: { entityType: "portfolio_report", entityId: report.id } });
      }
      await tx.notification.deleteMany({ where: { kind: "rollup.approved", message: { contains: "signed-rw" } } });
      await tx.portfolioReport.deleteMany({ where: { isoWeek: W } });
      await tx.blocker.deleteMany({ where: { projectId: { in: ids } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: ids } } });
      await tx.projectMember.deleteMany({ where: { projectId: { in: ids } } });
      await tx.project.deleteMany({ where: { id: { in: ids } } });
      await tx.portfolio.deleteMany({ where: { id: { in: portfolioIds } } });
      await tx.roleAssignment.deleteMany({ where: { userId: { in: [headCtx.userId, execCtx.userId] } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("PM: only the projects you lead or PM — with this week's row, meter and the 8-week grid", async () => {
    const v = await getReportsWeek(pmCtx, { isoWeek: W, view: "pm", now: NOW });
    if (v.kind !== "pm") throw new Error("expected pm view");
    expect(v.rows.map((r) => r.code)).toEqual(["RW1"]); // RW4 is Completed
    const r1 = v.rows[0]!;
    expect(r1).toMatchObject({ status: "Confirmed", sentToHead: true, canConfirm: true, narrative: "p1 line", draftLines: ["l1"] });
    expect(r1.sentAt?.getTime()).toBe(NOW.getTime());
    expect(v.meter).toEqual({ sent: 1, total: 1, toSend: 0 });
    expect(v.week).toMatchObject({ isoWeek: W, isCurrent: true, prev: W1, next: null });
    const grid = v.grid.find((g) => g.portfolioName === "RW Alpha")!;
    const cells = grid.rows.find((r) => r.code === "RW1")!.cells;
    expect(cells).toHaveLength(8);
    expect(cells[cells.length - 1]).toEqual({ isoWeek: W, rag: "Green" });
    expect(cells.find((c) => c.isoWeek === W2)?.rag).toBe("Red"); // read at THAT week's end → still signed Red
    expect(cells.find((c) => c.isoWeek === W1)?.rag).toBeNull(); // no check-in → hollow

    const m = await getReportsWeek(pmMemberCtx, { isoWeek: W, view: "pm", now: NOW });
    if (m.kind !== "pm") throw new Error("expected pm view");
    expect(m.rows.map((r) => r.code)).toEqual(["RW2"]); // "Project Manager" member counts
    expect(m.rows[0]).toMatchObject({ status: "Draft", computedRag: "Amber", confirmed: false });

    const none = await getReportsWeek(memberCtx, { isoWeek: W, view: "pm", now: NOW });
    expect(none.kind === "pm" && none.rows).toEqual([]);
  });

  it("PM, past weeks: history only — a signed override holds, a row-less week is 'None', nothing is confirmable", async () => {
    const old = await getReportsWeek(pmCtx, { isoWeek: W2, view: "pm", now: NOW });
    if (old.kind !== "pm") throw new Error("expected pm view");
    expect(old.rows[0]).toMatchObject({ status: "Confirmed", effectiveRag: "Red", canConfirm: false });
    expect(old.week).toMatchObject({ isCurrent: false, prev: W3, next: W1 });
    const empty = await getReportsWeek(pmCtx, { isoWeek: W3, view: "pm", now: NOW });
    if (empty.kind !== "pm") throw new Error("expected pm view");
    expect(empty.rows[0]).toMatchObject({ status: "None", draftLines: [], canConfirm: false });
    // A Head previewing as a PM is read-only, server-side.
    const preview = await getReportsWeek(pmCtx, { isoWeek: W, view: "pm", now: NOW, previewing: true });
    expect(preview.kind === "pm" && preview.rows[0]?.canConfirm).toBe(false);
  });

  it("Head: every active project in one inbox, grouped by portfolio (Unassigned last), with counts and the rail", async () => {
    const v = await getReportsWeek(headCtx, { isoWeek: W, view: "head", now: NOW });
    if (v.kind !== "head") throw new Error("expected head view");
    const mine = v.groups.filter((g) => g.rows.some((r) => r.code.startsWith("RW")));
    expect(mine.map((g) => g.portfolioName)).toEqual(["RW Alpha", "RW Beta", "Unassigned"]);
    expect(mine[0]).toMatchObject({ in: 1, total: 1 });
    expect(mine[1]).toMatchObject({ in: 0, total: 1 });
    const r1 = mine[0]!.rows[0]!;
    expect(r1).toMatchObject({ code: "RW1", received: true, computed: false, line: "p1 line", rag: "Green" });
    const r2 = mine[1]!.rows[0]!;
    expect(r2).toMatchObject({ code: "RW2", received: false, computed: true, line: null, rag: "Amber", nudgeable: true });
    expect(v.header.total).toBeGreaterThanOrEqual(3);
    expect(v.header.outstanding).toBe(v.header.total - v.header.in);
    expect(v.rollup.isoWeek).toBe(W);
    expect(v.rollup.ragCounts.computed).toBeGreaterThanOrEqual(2);
    expect(v.can).toEqual({ approve: true, nudge: true });

    // An Executive may read the inbox but never act on it.
    const asExec = await getReportsWeek(execCtx, { isoWeek: W, view: "head", now: NOW });
    expect(asExec.kind === "head" && asExec.can).toEqual({ approve: false, nudge: false });

    // Past week: the override is read as signed.
    const old = await getReportsWeek(headCtx, { isoWeek: W2, view: "head", now: NOW });
    const oldR1 = old.kind === "head" ? old.groups.flatMap((g) => g.rows).find((r) => r.code === "RW1") : undefined;
    expect(oldR1?.rag).toBe("Red");
  });

  it("Executive: 8-week grid with hollow weeks, tiles over every active project, decision blockers oldest first", async () => {
    const before = await getReportsWeek(execCtx, { isoWeek: W, view: "exec", now: NOW });
    if (before.kind !== "exec") throw new Error("expected exec view");
    expect(before.weeks).toHaveLength(8);
    expect(before.weeks[7]).toBe(W);
    const rows = before.grid.flatMap((g) => g.rows);
    const g1 = rows.find((r) => r.code === "RW1")!.cells;
    expect(g1.find((c) => c.isoWeek === W2)?.rag).toBe("Red");
    expect(g1.find((c) => c.isoWeek === W1)?.rag).toBeNull();
    expect(g1[7]?.rag).toBe("Green");
    expect(rows.find((r) => r.code === "RW3")!.cells.every((c) => c.rag === null)).toBe(true);
    expect(before.tiles.total).toBeGreaterThanOrEqual(3);
    expect(before.tiles.green + before.tiles.amber + before.tiles.red).toBe(before.tiles.total);
    const mine = before.decisions.filter((d) => d.description.startsWith("rw "));
    expect(mine.map((d) => d.description)).toEqual(["rw old medium", "rw critical"]);
    expect(mine[0]).toMatchObject({ projectCode: "RW1", ageDays: 10, escalated: true });
    expect(mine[1]).toMatchObject({ projectCode: "RW3", severity: "Critical", escalated: false });
    expect(before.approved).toBeNull();
    expect(typeof before.delta).toBe("string");

    await approveRollup(headCtx, "signed-rw week", NOW);
    const after = await getReportsWeek(execCtx, { isoWeek: W, view: "exec", now: NOW });
    if (after.kind !== "exec") throw new Error("expected exec view");
    expect(after.approved?.narrative).toBe("signed-rw week");
    expect(after.approved?.ragCounts).toBeDefined();
  });

  it("gates: a Member cannot read the Head or Executive views; a bad week is refused", async () => {
    await expect(getReportsWeek(memberCtx, { isoWeek: W, view: "head", now: NOW })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getReportsWeek(pmCtx, { isoWeek: "2028-W99", view: "pm", now: NOW })).rejects.toMatchObject({ code: "BAD_WEEK" });
  });

  it("nothing crosses tenants: demo-b's Head sees none of riverbank's projects or blockers", async () => {
    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["HeadOfProjects"], permissions: ["reports:read"] };
    const head = await getReportsWeek(other, { isoWeek: W, view: "head", now: NOW });
    expect(head.kind === "head" && head.groups.flatMap((g) => g.rows).some((r) => r.code.startsWith("RW"))).toBe(false);
    const exec = await getReportsWeek(other, { isoWeek: W, view: "exec", now: NOW });
    expect(exec.kind === "exec" && exec.decisions.some((d) => d.description.startsWith("rw "))).toBe(false);
  });
});

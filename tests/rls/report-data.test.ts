// Milestone D — the read models behind the PDFs: a project one-pager for a past week
// carries THAT week's signed line, the digest is gated like the CSV export (Heads see
// the live draft; others only an Approved week), and nothing crosses a tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId, shiftIsoWeek } from "@/lib/iso-week";
import { confirmCheckIn } from "@/server/checkins";
import { getDigestReport, getProjectReport } from "@/server/pdf/report-data";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2026-10-09T15:00:00Z");
const WEEK = isoWeekId(NOW);
const LAST = shiftIsoWeek(WEEK, -1);
const LAST_NOW = new Date(NOW.getTime() - 7 * 86_400_000);

describe("Milestone D — report data", () => {
  let rbId: string;
  let dbId: string;
  let head: TenantContext;
  let pm: TenantContext;
  let projectId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [h, p] = await createUsers(rbId, 2, "rpd");
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    projectId = await withTenant(head, async (tx) => {
      const project = await tx.project.create({
        data: { tenantId: rbId, code: `RPD-${Date.now().toString(36).toUpperCase()}`, name: "Report data <fixture>", status: "AtRisk", leadUserId: p.id, objective: "Pin the week" },
        select: { id: true },
      });
      await tx.blocker.create({ data: { tenantId: rbId, projectId: project.id, description: "Vendor sandbox", severity: "Critical", status: "Open", dateRaised: new Date(NOW.getTime() - 3 * 86_400_000) } });
      await tx.risk.create({ data: { tenantId: rbId, projectId: project.id, title: "Reviewer availability", probability: 4, impact: 4, status: "Open", mitigation: "Name reviewers" } });
      return project.id;
    });
    await confirmCheckIn(pm, projectId, { narrative: "Last week's signed line" }, LAST_NOW);
  });

  afterAll(async () => {
    await withTenant(head, async (tx) => {
      await tx.notification.deleteMany({ where: { link: { contains: "/reports" } , createdAt: { gte: new Date(Date.now() - 60_000) } } });
      await tx.domainEvent.deleteMany({ where: { entityId: projectId } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.risk.deleteMany({ where: { projectId } });
      await tx.blocker.deleteMany({ where: { projectId } });
      await tx.auditLog.deleteMany({ where: { actorId: { in: [head.userId, pm.userId] } } });
      await tx.project.delete({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("a past week reads that week's signed line; the current week the live draft; the register is live", async () => {
    const past = await getProjectReport(pm, projectId, LAST, NOW);
    expect(past?.checkIn).toMatchObject({ status: "Confirmed", narrative: "Last week's signed line" });
    expect(past?.week).toMatchObject({ isoWeek: LAST, isCurrent: false });
    expect(past?.template).toBe("build");
    expect(past?.decision).toMatchObject({ description: "Vendor sandbox", severity: "Critical", ageDays: 3 });
    expect(past?.topRisk).toMatchObject({ title: "Reviewer availability", rating: "Critical", mitigation: "Name reviewers" });
    expect(past?.dims.find((d) => d.key === "Risk")?.rag).toBe("R");

    const current = await getProjectReport(pm, projectId, WEEK, NOW);
    expect(current?.checkIn.status).toBe("Draft");
    expect(current?.checkIn.narrative).toBeNull();
    expect(current?.project).toMatchObject({ code: expect.stringMatching(/^RPD-/), summary: "Pin the week", pmName: expect.stringMatching(/^Fixture RPD/) });
  });

  it("the digest is live for a Head and Approved-only for everyone else; nothing crosses a tenant", async () => {
    const headView = await getDigestReport(head, WEEK, { now: NOW });
    expect(headView?.status).not.toBe("Approved");
    expect(headView?.groups.flatMap((g) => g.rows).some((r) => r.projectId === projectId)).toBe(true);
    expect(await getDigestReport(pm, WEEK, { now: NOW })).toBeNull();

    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["HeadOfProjects"] };
    expect(await getProjectReport(other, projectId, WEEK, NOW)).toBeNull();
    const foreign = await getDigestReport(other, WEEK, { now: NOW });
    expect(foreign?.groups.flatMap((g) => g.rows).some((r) => r.projectId === projectId) ?? false).toBe(false);
  });
});

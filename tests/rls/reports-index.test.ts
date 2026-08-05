// M-P3c (docs/34 §1) — the thin reports index's role composition, engine-level:
// my-updates lists ONLY mine; the project index scopes a PM to led projects while the
// Head sees all; the roll-up archive hides Drafts from non-heads; export respects the
// same visibility; tenant B sees nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { listMyReports } from "@/server/member-reports";
import { listReportIndex } from "@/server/checkins";
import { getRollupWeek, listRollups } from "@/server/portfolio-reports";
import { createUsers, cleanupFixtureUsers } from "./_users";

// Far-future weeks nobody else's suites touch (portfolio-rollup uses 2027-W10).
const WEEK_A = "2027-W20"; // Approved fixture
const WEEK_D = "2027-W21"; // Draft fixture

describe("M-P3c thin reports index", () => {
  let rbId: string;
  let dbId: string;
  let pmCtx: TenantContext;
  let headCtx: TenantContext;
  let memberCtx: TenantContext;
  let otherId: string;
  let ledId: string;
  let foreignId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, head, member, other] = await createUsers(rbId, 4, "rix");
    pmCtx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    headCtx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };
    memberCtx = { tenantId: rbId, userId: member.id, roles: ["Member"] };
    otherId = other.id;

    await withTenant(headCtx, async (tx) => {
      ledId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "RIX1", name: "rix led", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pm.id },
          select: { id: true },
        })
      ).id;
      foreignId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "RIX2", name: "rix foreign", type: "Project", priority: "Med", status: "AtRisk", leadUserId: head.id },
          select: { id: true },
        })
      ).id;
      // A confirmed, sent-to-Head check-in on the led project (a week no live suite uses).
      await tx.checkIn.create({
        data: {
          tenantId: rbId,
          projectId: ledId,
          isoWeek: WEEK_A,
          status: "Confirmed",
          computedRag: "Green",
          narrative: "rix narrative",
          confirmedById: pm.id,
          confirmedAt: new Date("2027-05-20T12:00:00.000Z"),
          submittedToHeadAt: new Date("2027-05-20T13:00:00.000Z"),
        },
      });
      // Member reports: one for the member, one for someone ELSE — the index must
      // never show the other person's.
      const draft = {
        sections: [{ projectId: ledId, projectCode: "RIX1", projectName: "rix led", done: [], doing: [], blockersRaised: [], blockersResolved: [], lines: ["x"], note: null, query: null }],
      };
      await tx.memberReport.create({
        data: { tenantId: rbId, userId: memberCtx.userId, isoWeek: WEEK_A, status: "Submitted", draft, submittedAt: new Date("2027-05-21T09:00:00.000Z") },
      });
      await tx.memberReport.create({
        data: { tenantId: rbId, userId: otherId, isoWeek: WEEK_A, status: "Draft", draft },
      });
      // Roll-up archive: one Approved week, one Draft week.
      await tx.portfolioReport.create({
        data: {
          tenantId: rbId,
          isoWeek: WEEK_A,
          status: "Approved",
          narrative: "rix signed week",
          payload: [{ projectId: ledId, code: "RIX1", name: "rix led", pmName: "Fixture", rag: "Green", checkIn: "Confirmed", submittedToHead: true, narrative: "rix narrative" }],
          approvedById: headCtx.userId,
          approvedAt: new Date("2027-05-22T10:00:00.000Z"),
        },
      });
      await tx.portfolioReport.create({
        data: { tenantId: rbId, isoWeek: WEEK_D, status: "Draft", payload: [] },
      });
    });
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      await tx.portfolioReport.deleteMany({ where: { isoWeek: { in: [WEEK_A, WEEK_D] } } });
      await tx.memberReport.deleteMany({ where: { userId: { in: [memberCtx.userId, otherId] } } });
      await tx.checkIn.deleteMany({ where: { projectId: { in: [ledId, foreignId] } } });
      await tx.project.deleteMany({ where: { id: { in: [ledId, foreignId] } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("my updates lists ONLY mine", async () => {
    const mine = await listMyReports(memberCtx);
    expect(mine.some((r) => r.isoWeek === WEEK_A)).toBe(true);
    expect(mine[0]?.projects.map((p) => p.projectCode)).toContain("RIX1");
    // The other person's report for the same week is a Draft — if scoping leaked,
    // it would appear here too (two rows for WEEK_A).
    expect(mine.filter((r) => r.isoWeek === WEEK_A)).toHaveLength(1);
    expect(mine[0]?.status).toBe("Submitted");
  });

  it("the project index scopes a PM to led projects; the Head sees all", async () => {
    const pmRows = await listReportIndex(pmCtx);
    expect(pmRows.map((r) => r.code)).toContain("RIX1");
    expect(pmRows.map((r) => r.code)).not.toContain("RIX2");
    const led = pmRows.find((r) => r.code === "RIX1")!;
    expect(led.latest?.status).toBe("Confirmed");
    expect(led.latest?.sentToHead).toBe(true);

    const headRows = await listReportIndex(headCtx);
    const codes = headRows.map((r) => r.code);
    expect(codes).toContain("RIX1");
    expect(codes).toContain("RIX2");
    expect(headRows.find((r) => r.code === "RIX2")!.latest).toBeNull();
  });

  it("the roll-up archive hides Drafts from non-heads and shows them to the Head", async () => {
    const pmView = await listRollups(pmCtx);
    expect(pmView.some((r) => r.isoWeek === WEEK_A)).toBe(true);
    expect(pmView.some((r) => r.isoWeek === WEEK_D)).toBe(false);
    const approved = pmView.find((r) => r.isoWeek === WEEK_A)!;
    expect(approved.narrative).toBe("rix signed week");
    expect(approved.projects).toBe(1);

    const headView = await listRollups(headCtx);
    expect(headView.some((r) => r.isoWeek === WEEK_D)).toBe(true);
  });

  it("export visibility follows the same rule: Draft weeks are the Head's only", async () => {
    expect(await getRollupWeek(pmCtx, WEEK_D)).toBeNull();
    const headDraft = await getRollupWeek(headCtx, WEEK_D);
    expect(headDraft?.status).toBe("Draft");
    const anyoneApproved = await getRollupWeek(pmCtx, WEEK_A);
    expect(anyoneApproved?.rows[0]?.code).toBe("RIX1");
  });

  it("tenant B sees none of it", async () => {
    const dbCtx: TenantContext = { tenantId: dbId, userId: "test", roles: ["HeadOfProjects"] };
    expect((await listRollups(dbCtx)).some((r) => r.isoWeek === WEEK_A)).toBe(false);
    expect((await listReportIndex(dbCtx)).some((r) => r.code === "RIX1")).toBe(false);
  });
});

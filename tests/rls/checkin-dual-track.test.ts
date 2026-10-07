// Milestone A (docs handoff §1.3) — two tracks on one check-in view: Build (the existing
// computed/effective RAG) and In-market (worst of this week's market cells, by the SAME
// rule as the rollout heatmap: the market check-in wins, else the track's status).
// Overall = worse of the two. A project with no market tracks shows Build alone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getCurrentCheckIn } from "@/server/checkins";
import { saveMarketCheckIn } from "@/server/rollout";
import { createUsers, cleanupFixtureUsers } from "./_users";

const NOW = new Date("2027-11-17T10:00:00.000Z"); // 2027-W46 — its own week

describe("Milestone A — dual-track RAG on the check-in view", () => {
  let rbId: string;
  let ctx: TenantContext;
  let projectId: string;
  let marketId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [head] = await createUsers(rbId, 1, "dt");
    ctx = { tenantId: rbId, userId: head.id, roles: ["HeadOfProjects"] };
    projectId = (
      await withTenant(ctx, (tx) =>
        tx.project.create({
          data: { tenantId: rbId, code: "DT1", name: "dual-track fixture", type: "Project", priority: "Med", status: "OnTrack", leadUserId: head.id },
          select: { id: true },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.marketCheckIn.deleteMany({ where: { projectId } });
      await tx.domainEvent.deleteMany({ where: { type: "market_checkin.saved", payload: { path: ["projectId"], equals: projectId } } });
      await tx.auditLog.deleteMany({ where: { entityType: "market_check_in", after: { path: ["market"], equals: "DTX1" } } });
      await tx.projectOrgStatus.deleteMany({ where: { projectId } });
      if (marketId) await tx.orgUnit.deleteMany({ where: { id: marketId } });
      await tx.checkIn.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("a project that ships nowhere has Build only — marketRag null, overall = build", async () => {
    const view = await getCurrentCheckIn(ctx, projectId, NOW);
    expect(view.buildRag).toBe(view.effectiveRag);
    expect(view.marketRag).toBeNull();
    expect(view.markets).toEqual([]);
    expect(view.overallRag).toBe(view.buildRag);
  });

  it("a market track with no check-in this week takes the track's status; a Red check-in wins and drags overall", async () => {
    marketId = (
      await withTenant(ctx, async (tx) => {
        const m = await tx.orgUnit.create({
          data: { tenantId: rbId, code: "DTX1", name: "Dual-track market", kind: "Market" },
          select: { id: true },
        });
        await tx.projectOrgStatus.create({ data: { tenantId: rbId, projectId, orgUnitId: m.id, progress: 40, status: "OnTrack" } });
        return m;
      })
    ).id;

    const before = await getCurrentCheckIn(ctx, projectId, NOW);
    expect(before.markets).toHaveLength(1);
    expect(before.markets[0]).toMatchObject({ code: "DTX1", rag: "Green", checkedIn: false, progress: 40 });
    expect(before.marketRag).toBe("Green");

    await saveMarketCheckIn(ctx, projectId, marketId, { narrative: "P1 incident, agents offline.", rag: "Red" }, NOW);

    const after = await getCurrentCheckIn(ctx, projectId, NOW);
    expect(after.buildRag).toBe("Green"); // OnTrack, no signals — Build is untouched
    expect(after.markets[0]).toMatchObject({ rag: "Red", checkedIn: true });
    expect(after.marketRag).toBe("Red");
    expect(after.overallRag).toBe("Red"); // worse of the two
  });
});

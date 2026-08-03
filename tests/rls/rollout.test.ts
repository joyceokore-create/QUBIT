// M-D-B rollout lens (docs/18 §3 + §6): the project × market heatmap. Cell % is derived
// from that track's own checkpoint states, RAG rolls up bottom-up through the ONE health
// engine, a market a project doesn't ship into stays null (not 0%), market check-ins are
// gated + audited, and nothing crosses a tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isoWeekId } from "@/lib/iso-week";
import { getMarketTrack, getRolloutMatrices, getRolloutMatrix, saveMarketCheckIn } from "@/server/rollout";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-D-B rollout matrix", () => {
  let rvId: string;
  let demoBId: string;
  let leadId: string;
  let ctx: TenantContext;
  let portfolioId: string;
  let projectId: string;
  let marketA: string;
  let marketB: string;
  let unusedMarket: string;

  beforeAll(async () => {
    const [rv, demoB] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rv || !demoB) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    rvId = rv.id;
    demoBId = demoB.id;
    const [lead] = await createUsers(rvId, 1, "ro");
    leadId = lead.id;
    ctx = { tenantId: rvId, userId: leadId, roles: ["Member"] };

    await withTenant({ tenantId: rvId, userId: "test" }, async (tx) => {
      const portfolio = await tx.portfolio.create({
        data: { tenantId: rvId, name: `ZZZ Rollout Fixture ${Date.now() % 100000}`, viewKind: "Rollout" },
      });
      portfolioId = portfolio.id;
      const template = await tx.checkpointTemplate.findFirstOrThrow({
        where: { name: "Market rollout" },
        select: { id: true, checkpoints: { select: { id: true }, orderBy: { orderIndex: "asc" } } },
      });
      const project = await tx.project.create({
        data: {
          tenantId: rvId,
          code: `RO${Date.now() % 100000}`,
          name: "Rollout Fixture Product",
          type: "Project",
          priority: "High",
          status: "OnTrack",
          portfolioId,
          leadUserId: leadId,
          checkpointTemplateId: template.id,
        },
      });
      projectId = project.id;

      const markets = await tx.orgUnit.findMany({ where: { kind: "Market" }, orderBy: { createdAt: "asc" }, select: { id: true } });
      marketA = markets[0].id;
      marketB = markets[1].id;
      unusedMarket = markets[2].id;

      // Market A: 4 of 8 gates Done → 50%. Market B: 2 Done + 1 InProgress → 31%.
      await tx.projectOrgStatus.createMany({
        data: [
          { tenantId: rvId, projectId, orgUnitId: marketA, progress: 0, status: "OnTrack" },
          { tenantId: rvId, projectId, orgUnitId: marketB, progress: 0, status: "AtRisk" },
        ],
      });
      const gates = template.checkpoints;
      for (let i = 0; i < gates.length; i++) {
        await tx.checkpointStatus.create({
          data: { tenantId: rvId, projectId, checkpointId: gates[i].id, orgUnitId: marketA, state: i < 4 ? "Done" : "NotStarted" },
        });
        await tx.checkpointStatus.create({
          data: {
            tenantId: rvId, projectId, checkpointId: gates[i].id, orgUnitId: marketB,
            state: i < 2 ? "Done" : i === 2 ? "InProgress" : "NotStarted",
          },
        });
      }
    });
  });

  afterAll(async () => {
    await withTenant({ tenantId: rvId, userId: "test" }, async (tx) => {
      await tx.domainEvent.deleteMany({ where: { type: "market_checkin.saved" } });
      // ProjectOrgStatus's project FK does not cascade (same reason the seed's reset
      // clears it explicitly) — drop the tracks before the project.
      await tx.projectOrgStatus.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
      await tx.portfolio.deleteMany({ where: { id: portfolioId } });
    });
    await cleanupFixtureUsers(rvId);
    await prisma.$disconnect();
  });

  it("derives each cell's % from that market's own gate states", async () => {
    const matrix = (await getRolloutMatrix(ctx, portfolioId))!;
    const row = matrix.rows.find((r) => r.projectId === projectId)!;
    const cellA = row.cells.find((c) => c.orgUnitId === marketA)!;
    const cellB = row.cells.find((c) => c.orgUnitId === marketB)!;
    expect(cellA.progress).toBe(50); // 4 Done of 8
    expect(cellA.gatesDone).toBe(4);
    expect(cellB.progress).toBe(31); // (2 + 0.5) / 8 = 31.25%
  });

  it("a market the project does not ship into is null, never a misleading 0%", async () => {
    const matrix = (await getRolloutMatrix(ctx, portfolioId))!;
    const row = matrix.rows.find((r) => r.projectId === projectId)!;
    const none = row.cells.find((c) => c.orgUnitId === unusedMarket)!;
    expect(none.progress).toBeNull();
    expect(none.rag).toBeNull();
  });

  it("rolls RAG up bottom-up: worst market wins the project row (§3.0)", async () => {
    const matrix = (await getRolloutMatrix(ctx, portfolioId))!;
    const row = matrix.rows.find((r) => r.projectId === projectId)!;
    // Market A is OnTrack (Green), market B AtRisk (Amber) → the row reads Amber.
    expect(row.rag).toBe("Amber");
    // The summary row averages only the live cells of each column.
    const summaryA = matrix.summary.find((s) => s.orgUnitId === marketA)!;
    expect(summaryA.progress).toBe(50);
    const summaryUnused = matrix.summary.find((s) => s.orgUnitId === unusedMarket)!;
    expect(summaryUnused.rag).toBeNull();
  });

  it("a market check-in supplies the cell's RAG and narrative, and is audited", async () => {
    await saveMarketCheckIn(ctx, projectId, marketA, {
      narrative: "Telco integration signed off; GTM pack with the brand team.",
      rag: "Red",
    });

    const matrix = (await getRolloutMatrix(ctx, portfolioId))!;
    const cellA = matrix.rows.find((r) => r.projectId === projectId)!.cells.find((c) => c.orgUnitId === marketA)!;
    expect(cellA.rag).toBe("Red"); // the human's word outranks the track's stored status
    expect(cellA.narrative).toContain("Telco integration");
    // …and the worst-of roll-up follows it.
    expect(matrix.rows.find((r) => r.projectId === projectId)!.rag).toBe("Red");

    const [audit, event] = await withTenant({ tenantId: rvId, userId: "test" }, (tx) =>
      Promise.all([
        tx.auditLog.findFirst({ where: { entityType: "market_check_in", actorId: leadId }, orderBy: { createdAt: "desc" } }),
        tx.domainEvent.findFirst({ where: { type: "market_checkin.saved" }, orderBy: { createdAt: "desc" } }),
      ]),
    );
    expect((audit?.after as { rag?: string })?.rag).toBe("Red");
    expect((event?.payload as { projectId?: string })?.projectId).toBe(projectId);
  });

  it("the drill-down shows that track's gates and this week's check-in", async () => {
    const track = (await getMarketTrack(ctx, projectId, marketA))!;
    expect(track.progress).toBe(50);
    expect(track.rows).toHaveLength(8);
    expect(track.rows.filter((r) => r.state === "Done")).toHaveLength(4);
    expect(track.checkIn?.rag).toBe("Red");
    expect(track.checkIn?.isoWeek).toBe(isoWeekId(new Date()));
    // An Internal org unit is not a market — the drill-down refuses it.
    const internalId = await withTenant({ tenantId: rvId, userId: "test" }, (tx) =>
      tx.orgUnit.findFirstOrThrow({ where: { kind: "Internal" }, select: { id: true } }).then((o) => o.id),
    );
    expect(await getMarketTrack(ctx, projectId, internalId)).toBeNull();
  });

  it("RLS: the other tenant sees none of this portfolio's rollout data", async () => {
    const [kcbUser] = await createUsers(demoBId, 1, "rokcb");
    const kcbCtx = { tenantId: demoBId, userId: kcbUser.id, roles: ["Member"] };
    expect(await getRolloutMatrix(kcbCtx, portfolioId)).toBeNull();
    const matrices = await getRolloutMatrices(kcbCtx);
    expect(matrices.some((m) => m.portfolioId === portfolioId)).toBe(false);
    // the fixture tenant has no Market org units at all, so its rollout portfolios render no columns.
    for (const m of matrices) expect(m.markets).toHaveLength(0);
    await cleanupFixtureUsers(demoBId);
  });
});

// M-P1b (docs/27 §2) — portfolio & programme creation engine, against the real database:
// category persisted, owner eligibility, market validation, Pipeline-drops-markets,
// audit rows, and cross-tenant invisibility.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createPortfolio, createProgramme, updatePortfolio } from "@/server/portfolios";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-P1b portfolio & programme creation", () => {
  let rbId: string;
  let dbId: string;
  let ctx: TenantContext;
  let dbCtx: TenantContext;
  let headId: string;
  let plainId: string;
  let marketId: string;
  const made: string[] = [];

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required — run `pnpm prisma:seed`.");
    rbId = rb.id;
    dbId = db.id;
    const [head, plain] = await createUsers(rbId, 2, "pfc");
    headId = head.id;
    plainId = plain.id;
    ctx = { tenantId: rbId, userId: headId, roles: ["HeadOfProjects"] };
    dbCtx = { tenantId: dbId, userId: "test", roles: ["Member"] };
    await withTenant(ctx, (tx) =>
      tx.roleAssignment.create({ data: { tenantId: rbId, userId: headId, role: "HeadOfProjects" } }),
    );
    const market = await withTenant(ctx, (tx) =>
      tx.orgUnit.findFirst({ where: { kind: "Market" }, select: { id: true } }),
    );
    if (!market) throw new Error("Seed must include Market org units.");
    marketId = market.id;
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.programme.deleteMany({ where: { name: { startsWith: "mp1b-" } } });
      await tx.portfolio.deleteMany({ where: { id: { in: made } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("creates a Rollout portfolio with category, markets and an audit row", async () => {
    const p = await createPortfolio(ctx, {
      name: "mp1b-Open Banking",
      category: "Approved",
      viewKind: "Rollout",
      ownerId: headId,
      marketIds: [marketId],
    });
    made.push(p.id);
    expect(p.category).toBe("Approved");
    expect(p.defaultMarkets).toEqual([marketId]);

    const auditRow = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({ where: { entityType: "portfolio", entityId: p.id, action: "create" } }),
    );
    expect(auditRow).not.toBeNull();
    const event = await withTenant(ctx, (tx) =>
      tx.domainEvent.findFirst({ where: { type: "portfolio.created", entityId: p.id } }),
    );
    expect(event).not.toBeNull();
  });

  it("a Pipeline portfolio silently drops markets — they are a Rollout concept", async () => {
    const p = await createPortfolio(ctx, {
      name: "mp1b-Build Only",
      category: "Exploring",
      viewKind: "Pipeline",
      marketIds: [marketId],
    });
    made.push(p.id);
    expect(p.defaultMarkets).toBeNull();
  });

  it("rejects an owner who is not a Head or Executive", async () => {
    await expect(
      createPortfolio(ctx, {
        name: "mp1b-Bad Owner",
        category: "Exploring",
        viewKind: "Pipeline",
        ownerId: plainId,
        marketIds: [],
      }),
    ).rejects.toMatchObject({ code: "OWNER_INELIGIBLE" });
  });

  it("rejects a market id that is not a Market org unit", async () => {
    const internal = await withTenant(ctx, (tx) =>
      tx.orgUnit.findFirst({ where: { kind: "Internal" }, select: { id: true } }),
    );
    if (!internal) return; // tenant has no internal units — nothing to mis-pick
    await expect(
      createPortfolio(ctx, {
        name: "mp1b-Bad Market",
        category: "Exploring",
        viewKind: "Rollout",
        marketIds: [internal.id],
      }),
    ).rejects.toMatchObject({ code: "BAD_MARKET" });
  });

  it("a programme lands in its portfolio with a category; a foreign portfolio id fails", async () => {
    const p = await createPortfolio(ctx, {
      name: "mp1b-Parent",
      category: "Approved",
      viewKind: "Pipeline",
      marketIds: [],
    });
    made.push(p.id);
    const pg = await createProgramme(ctx, {
      name: "mp1b-Core",
      portfolioId: p.id,
      category: "Approved",
    });
    expect(pg.portfolioId).toBe(p.id);
    expect(pg.category).toBe("Approved");

    // A tenant-B caller cannot hang a programme off tenant A's portfolio: RLS hides it.
    await expect(
      createProgramme({ ...dbCtx, roles: ["HeadOfProjects"] }, {
        name: "mp1b-CrossTenant",
        portfolioId: p.id,
        category: "Exploring",
      }),
    ).rejects.toMatchObject({ code: "PORTFOLIO_NOT_FOUND" });
  });

  it("gap 1: governance edits land with a before/after audit; a bad owner is refused", async () => {
    const p = await createPortfolio(ctx, {
      name: "mp1b-Editable",
      category: "Exploring",
      viewKind: "Pipeline",
      marketIds: [],
    });
    made.push(p.id);
    const updated = await updatePortfolio(ctx, p.id, { category: "Approved", name: "mp1b-Edited" });
    expect(updated.category).toBe("Approved");
    expect(updated.name).toBe("mp1b-Edited");
    const auditRow = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({
        where: { entityType: "portfolio", entityId: p.id, action: "update" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect((auditRow?.before as { category?: string })?.category).toBe("Exploring");
    expect((auditRow?.after as { category?: string })?.category).toBe("Approved");

    await expect(updatePortfolio(ctx, p.id, { ownerId: plainId })).rejects.toMatchObject({ code: "OWNER_INELIGIBLE" });
    await expect(updatePortfolio(ctx, "00000000-0000-4000-8000-000000000000", { name: "ghost-edit" })).rejects.toMatchObject({
      code: "PORTFOLIO_NOT_FOUND",
    });
  });

  it("tenant B cannot see tenant A's new portfolio", async () => {
    const foreign = await withTenant(dbCtx, (tx) =>
      tx.portfolio.findFirst({ where: { id: { in: made } } }),
    );
    expect(foreign).toBeNull();
  });
});

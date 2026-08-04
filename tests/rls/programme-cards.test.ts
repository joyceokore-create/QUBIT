// M-W1a (docs/32) — programme index cards: counts and category grouping source, RLS-scoped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getProgrammeCards } from "@/server/dashboard";

describe("M-W1a programme cards", () => {
  let ctx: TenantContext;
  let dbCtx: TenantContext;
  let portfolioId: string;
  let programmeId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    ctx = { tenantId: rb.id, userId: "test", roles: ["Member"] };
    dbCtx = { tenantId: db.id, userId: "test", roles: ["Member"] };

    portfolioId = (
      await withTenant(ctx, (tx) =>
        tx.portfolio.create({ data: { tenantId: rb.id, name: "mw1a-portfolio" }, select: { id: true } }),
      )
    ).id;
    programmeId = (
      await withTenant(ctx, (tx) =>
        tx.programme.create({
          data: { tenantId: rb.id, portfolioId, name: "mw1a-programme", status: "Active", category: "Approved" },
          select: { id: true },
        }),
      )
    ).id;
    // Two projects inside: statuses drive the RAG counters.
    await withTenant(ctx, async (tx) => {
      for (const [code, status] of [["MW1A", "OnTrack"], ["MW1B", "AtRisk"]] as const) {
        await tx.project.create({
          data: {
            tenantId: rb.id,
            code,
            name: `mw1a ${code}`,
            type: "Project",
            priority: "Med",
            status,
            portfolioId,
            programmeId,
          },
        });
      }
    });
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.project.deleteMany({ where: { code: { in: ["MW1A", "MW1B"] } } });
      await tx.programme.delete({ where: { id: programmeId } });
      await tx.portfolio.delete({ where: { id: portfolioId } });
    });
    await prisma.$disconnect();
  });

  it("counts its projects, carries category + parent, and computes RAG buckets", async () => {
    const card = (await getProgrammeCards(ctx)).find((c) => c.id === programmeId);
    expect(card).toBeDefined();
    expect(card!.category).toBe("Approved");
    expect(card!.portfolioName).toBe("mw1a-portfolio");
    expect(card!.itemCount).toBe(2);
    expect(card!.onTrack).toBe(1);
    expect(card!.atRisk).toBe(1);
  });

  it("tenant B never sees it", async () => {
    const cards = await getProgrammeCards(dbCtx);
    expect(cards.find((c) => c.id === programmeId)).toBeUndefined();
  });
});

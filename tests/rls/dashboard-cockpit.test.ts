// Cockpit data assembler. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { getCockpitData } from "@/server/dashboard-cockpit";

describe("cockpit data assembler", () => {
  let riverbankId: string;
  let demoBId: string;
  let rbCtx: TenantContext;
  let bCtx: TenantContext;

  beforeAll(async () => {
    const [rb, demoB] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !demoB) throw new Error("cockpit tests require seeded data — run `pnpm prisma:seed` first.");
    riverbankId = rb.id;
    demoBId = demoB.id;
    rbCtx = { tenantId: riverbankId, userId: "test-cockpit-rb", roles: ["PlatformSuperAdmin"], permissions: ["*"] };
    bCtx = { tenantId: demoBId, userId: "test-cockpit-b", roles: ["PlatformSuperAdmin"], permissions: ["*"] };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("assembles projects with a reported + calculated RAG and derived dimensions", async () => {
    const data = await getCockpitData(rbCtx);
    expect(data.projects.length).toBeGreaterThan(0);
    for (const p of data.projects) {
      expect(["G", "A", "R", "N"]).toContain(p.reported);
      expect(["G", "A", "R", "N"]).toContain(p.calculated);
      // Every dimension is one of the four tokens.
      for (const v of Object.values(p.dims)) expect(["G", "A", "R", "N"]).toContain(v);
      // Budget is "not rated" wherever the project has no budget captured.
      if (!p.hasBudget) expect(p.dims.Budget).toBe("N");
      // A dispute means reported is strictly greener than calculated.
      if (p.dispute) {
        const order: Record<string, number> = { R: 0, A: 1, G: 2, N: 3 };
        expect(order[p.reported]).toBeGreaterThan(order[p.calculated]);
      }
    }
  });

  it("RLS: each tenant only sees its own projects", async () => {
    const [rb, b] = await Promise.all([getCockpitData(rbCtx), getCockpitData(bCtx)]);
    const rbIds = new Set(rb.projects.map((p) => p.id));
    const bIds = new Set(b.projects.map((p) => p.id));
    for (const id of bIds) expect(rbIds.has(id)).toBe(false);
    // Riverbank has real seeded projects; the fixture tenant is separate.
    expect(rb.projects.length).toBeGreaterThan(0);
  });

  it("groups project leads into PMs for the Head roll-up", async () => {
    const data = await getCockpitData(rbCtx);
    for (const pm of data.pms) {
      expect(pm.projectIds.length).toBeGreaterThan(0);
      // Every rolled-up project is led by that PM.
      for (const pid of pm.projectIds) {
        expect(data.projects.find((p) => p.id === pid)?.pmId).toBe(pm.id);
      }
    }
  });

  it("returns an 8-week trend shape (possibly empty before snapshots accrue)", async () => {
    const data = await getCockpitData(rbCtx);
    expect(data.trend.weeks.length).toBe(data.trend.series.length);
    // When present, each point is a [green, amber, red] triple.
    for (const point of data.trend.series) expect(point).toHaveLength(3);
  });
});

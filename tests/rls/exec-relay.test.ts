// M-W1b (docs/32) — exec re-lay: category grouping of sections (pure), estate counts,
// and the Head-only check-in queue (visible to HeadOfProjects/SuperAdmin, null for a
// plain Executive).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { getExecutiveDashboard } from "@/server/dashboard-exec";
import { groupSectionsByCategory, type PortfolioSectionsData } from "@/server/pipeline";

describe("M-W1b groupSectionsByCategory (pure)", () => {
  const section = (over: Record<string, unknown>) => ({
    id: "x",
    name: "X",
    category: "Approved",
    viewKind: "Pipeline" as const,
    rag: "Green" as const,
    ragDelta: null,
    progress: 0,
    openBlockers: 0,
    ownerName: null,
    isUnassigned: false,
    projectCount: 1,
    table: { groups: [], total: 0, mineCount: 0 },
    ...over,
  });

  it("partitions Approved → Exploring → Shelved, keeping input order within a group", () => {
    const data = {
      sections: [
        section({ id: "s1", category: "Shelved" }),
        section({ id: "a1", category: "Approved" }),
        section({ id: "e1", category: "Exploring" }),
        section({ id: "a2", category: "Approved" }),
      ],
      total: 4,
      mineCount: 0,
    } as unknown as PortfolioSectionsData;
    const grouped = groupSectionsByCategory(data);
    expect(grouped.map((g) => g.category)).toEqual(["Approved", "Exploring", "Shelved"]);
    expect(grouped[0].data.sections.map((s) => s.id)).toEqual(["a1", "a2"]); // input order kept
  });

  it("an unknown category lands in Approved rather than vanishing; empty groups drop", () => {
    const data = {
      sections: [section({ id: "w1", category: "Weird" })],
      total: 1,
      mineCount: 0,
    } as unknown as PortfolioSectionsData;
    const grouped = groupSectionsByCategory(data);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].category).toBe("Approved");
    expect(grouped[0].data.sections[0].id).toBe("w1");
  });
});

describe("M-W1b exec dashboard: counts + head queue", () => {
  let rbId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("a plain Executive gets counts but NO head queue", async () => {
    const ctx: TenantContext = { tenantId: rbId, userId: "test", roles: ["Executive"] };
    const d = await getExecutiveDashboard(ctx);
    expect(d.counts.portfolios).toBeGreaterThan(0);
    expect(d.counts.activeProjects).toBeGreaterThan(0);
    expect(d.headQueue).toBeNull();
  });

  it("the Head gets the queue: one row per active project with a check-in state", async () => {
    const ctx: TenantContext = { tenantId: rbId, userId: "test", roles: ["HeadOfProjects"] };
    const d = await getExecutiveDashboard(ctx);
    expect(d.headQueue).not.toBeNull();
    expect(d.headQueue!.length).toBe(d.counts.activeProjects);
    for (const row of d.headQueue!) {
      expect(["Confirmed", "Draft", "None"]).toContain(row.checkIn);
    }
  });
});

// Phase 2 — getBriefing fetch wiring against the real schema. Requires a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { getBriefing } from "@/server/relevance";

describe("getBriefing (fetch) — Phase 2", () => {
  let kcbId: string;
  let riverbankId: string;

  beforeAll(async () => {
    const [kcb, rb] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !rb) throw new Error("getBriefing tests require seeded data — run `pnpm prisma:seed` first.");
    kcbId = kcb.id;
    riverbankId = rb.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns a well-formed, ranked briefing without throwing (all queries wire up)", async () => {
    const ctx: TenantContext = { tenantId: riverbankId, userId: "smoke-viewer", roles: ["PlatformSuperAdmin"] };
    const briefing = await getBriefing(ctx, 3);
    expect(Array.isArray(briefing)).toBe(true);
    expect(briefing.length).toBeLessThanOrEqual(3);
    for (const item of briefing) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.href).toBe("string");
      expect(["red", "amber", "info"]).toContain(item.severity);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it("computes each tenant's briefing independently (RLS-scoped fetch)", async () => {
    const rb = await getBriefing({ tenantId: riverbankId, userId: "v", roles: ["Executive"] }, 5);
    const kcb = await getBriefing({ tenantId: kcbId, userId: "v", roles: ["Executive"] }, 5);
    // Different tenants → disjoint entity ids (RLS scopes every query in the fetch).
    const overlap = rb.map((i) => i.id).some((id) => kcb.map((k) => k.id).includes(id));
    expect(overlap).toBe(false);
  });
});

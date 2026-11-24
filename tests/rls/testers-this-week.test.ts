// UX fidelity Tier 1 — Quality Home › Testers This Week reads only the caller's tenant.
// Requires a migrated, seeded DB; read-only.
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { testersOverbooked } from "@/server/testers-this-week";

describe("Testers This Week", () => {
  it("returns only people in the caller's tenant who are over 100%", async () => {
    const tenants = await prisma.tenant.findMany({ where: { slug: { in: ["riverbank", "demo-b"] } } });
    expect(tenants).toHaveLength(2);
    for (const t of tenants) {
      const ctx: TenantContext = { tenantId: t.id, userId: "test-testers", roles: ["HeadOfQA"] };
      const rows = await testersOverbooked(ctx);
      expect(rows.every((r) => r.pct > 100)).toBe(true);
      if (rows.length) {
        const mine = await withTenant(ctx, (tx) => tx.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true } }));
        expect(mine).toHaveLength(rows.length);
      }
    }
    await prisma.$disconnect();
  });
});

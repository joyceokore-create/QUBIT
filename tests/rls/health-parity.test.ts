// M0 trust invariant (docs/16-revamp-plan.md §10/§14): dashboard RAG === Q RAG for 100%
// of projects. The exec dashboard and Q's portfolio report are independent surfaces that
// must derive health from src/server/health.ts — this suite fails if either grows its own
// classification again. Requires migrations + seed (like every rls suite).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { getDashboardV2 } from "@/server/dashboard-v2";
import { generateReport } from "@/server/q/report";
import { needsAttention } from "@/server/health";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

interface AttentionRow {
  code: string;
  status: string;
}

describe("health parity — dashboard vs Q", () => {
  const tenants: { slug: string; ctx: TenantContext; name: string }[] = [];

  beforeAll(async () => {
    for (const slug of ["kcb", "riverbank"]) {
      const tenant = await prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) throw new Error("Parity tests require seeded tenants — run `pnpm prisma:seed`.");
      const [user] = await ensureUsers(tenant.id, 1);
      tenants.push({
        slug,
        name: tenant.name,
        ctx: { tenantId: tenant.id, userId: user.id, roles: ["PlatformSuperAdmin"] },
      });
    }
  });

  afterAll(async () => {
    for (const t of tenants) await cleanupFixtureUsers(t.ctx.tenantId);
    await prisma.$disconnect();
  });

  it("agrees on totals and the exact needs-attention set for every project, both tenants", async () => {
    for (const t of tenants) {
      const dashboard = await getDashboardV2(t.ctx);
      const report = await generateReport(t.ctx, { type: "portfolio", tenantName: t.name });
      const data = report.data as {
        totals: { projects: number; onTrack: number; atRisk: number; overdue: number; completed: number };
        needsAttention: AttentionRow[];
      };

      // Portfolio totals line up.
      expect(data.totals.projects).toBe(dashboard.health.total);
      expect(data.totals.onTrack + data.totals.completed).toBe(dashboard.health.onTrack);
      expect(data.totals.atRisk + data.totals.overdue).toBe(dashboard.health.needAttention);
      expect(dashboard.health.needAttention).toBe(data.needsAttention.length);

      // 100% of projects: the two surfaces flag exactly the same set.
      const dashboardFlagged = dashboard.projects
        .filter((p) => needsAttention(p.status))
        .map((p) => p.code)
        .sort();
      const qFlagged = data.needsAttention.map((p) => p.code).sort();
      expect(qFlagged).toEqual(dashboardFlagged);

      // And every flagged project is genuinely non-Green.
      for (const row of data.needsAttention) expect(needsAttention(row.status)).toBe(true);
    }
  });
});

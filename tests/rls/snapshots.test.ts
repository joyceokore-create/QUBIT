// M1 nightly snapshots: per-tenant rows under RLS, idempotent same-day re-runs, and
// portfolio numbers that agree with the one health engine.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { runJob } from "@/server/jobs";
import { portfolioHealth } from "@/server/health";

const KEY_PREFIX = `snapshots-test-${process.pid}`;
let keySeq = 0;
const nextKey = () => `${KEY_PREFIX}:${++keySeq}`;

describe("nightly-snapshot job", () => {
  let kcbId: string;
  let riverbankId: string;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
  });

  afterAll(async () => {
    await prisma.jobRun.deleteMany({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } });
    await prisma.$disconnect();
  });

  it("writes one ProjectSnapshot per project and one PortfolioSnapshot per tenant", async () => {
    const result = await runJob("nightly-snapshot", nextKey());
    expect(result.status).toBe("Succeeded");

    for (const tenantId of [kcbId, riverbankId]) {
      await withTenant({ tenantId, userId: "test" }, async (tx) => {
        const today = new Date();
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        const [projects, projectSnapshots, portfolioSnapshot] = await Promise.all([
          tx.project.findMany({ select: { status: true } }),
          tx.projectSnapshot.count({ where: { day } }),
          tx.portfolioSnapshot.findFirstOrThrow({ where: { day } }),
        ]);
        expect(projectSnapshots).toBe(projects.length);

        // The snapshot's rollup is the health engine's, exactly.
        const expected = portfolioHealth(projects.map((p) => p.status));
        expect(portfolioSnapshot.projects).toBe(expected.total);
        expect(portfolioSnapshot.onTrack).toBe(expected.onTrack);
        expect(portfolioSnapshot.needAttention).toBe(expected.needAttention);
        expect(portfolioSnapshot.onTrackPct).toBe(expected.pct);
      });
    }
  });

  it("re-running the same day upserts — no duplicate rows", async () => {
    await runJob("nightly-snapshot", nextKey());
    const before = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) => tx.projectSnapshot.count());
    await runJob("nightly-snapshot", nextKey());
    const after = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) => tx.projectSnapshot.count());
    expect(after).toBe(before);
  });

  it("keeps snapshots tenant-isolated", async () => {
    const kcbProject = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.projectSnapshot.findFirstOrThrow({ select: { id: true } }),
    );
    const crossRead = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.projectSnapshot.findUnique({ where: { id: kcbProject.id } }),
    );
    expect(crossRead).toBeNull();

    const unscoped = await prisma.projectSnapshot.findMany({ take: 1 });
    expect(unscoped).toHaveLength(0);
  });

  it("leaves a machine-actor audit trail", async () => {
    const row = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.auditLog.findFirst({ where: { actorId: "job:nightly-snapshot", entityType: "portfolio_snapshot" } }),
    );
    expect(row).not.toBeNull();
  });
});

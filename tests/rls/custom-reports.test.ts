// Custom Reports engine. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { REPORT_DATASETS } from "@/lib/report-catalogue";
import {
  allowedDatasetKeys,
  CustomReportError,
  DATASET_PERMISSION,
  runCustomReport,
} from "@/server/custom-reports";

describe("custom reports engine", () => {
  let riverbankId: string;
  let demoBId: string;
  let rbCtx: TenantContext;
  let bCtx: TenantContext;

  beforeAll(async () => {
    const [rb, demoB] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !demoB) throw new Error("custom-report tests require seeded data — run `pnpm prisma:seed` first.");
    riverbankId = rb.id;
    demoBId = demoB.id;
    rbCtx = { tenantId: riverbankId, userId: "test-reports-rb", roles: ["PlatformSuperAdmin"], permissions: ["*"] };
    bCtx = { tenantId: demoBId, userId: "test-reports-b", roles: ["PlatformSuperAdmin"], permissions: ["*"] };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("every registry dataset has a permission-map entry", () => {
    for (const d of REPORT_DATASETS) {
      expect(DATASET_PERMISSION).toHaveProperty(d.key);
    }
  });

  it("allowedDatasetKeys follows permissions (wildcard sees all; bare session sees workload only)", () => {
    expect(allowedDatasetKeys(rbCtx).sort()).toEqual(REPORT_DATASETS.map((d) => d.key).sort());
    const bare: TenantContext = { tenantId: riverbankId, userId: "u", roles: [], permissions: [] };
    expect(allowedDatasetKeys(bare)).toEqual(["workload"]);
  });

  it("returns only the requested columns, in registry order", async () => {
    const result = await runCustomReport(rbCtx, "projects", ["name", "status", "code"]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.columns.map((c) => c.key)).toEqual(["name", "status", "code"]);
    for (const row of result.rows) {
      expect(Object.keys(row).sort()).toEqual(["code", "name", "status"]);
    }
  });

  it("rejects a column key the registry does not name", async () => {
    await expect(runCustomReport(rbCtx, "projects", ["name", "passwordHash"])).rejects.toThrow(CustomReportError);
  });

  it("RLS: each tenant only sees its own project rows", async () => {
    const [rb, b] = await Promise.all([
      runCustomReport(rbCtx, "projects", ["code"]),
      runCustomReport(bCtx, "projects", ["code"]),
    ]);
    const rbCodes = new Set(rb.rows.map((r) => r.code));
    for (const row of b.rows) expect(rbCodes.has(row.code)).toBe(false);
    expect(rb.rows.length).toBeGreaterThan(0);
  });

  it("tasks: only Published tasks appear (Drafts are excluded), full set for a tenant-wide PM", async () => {
    const published = await withTenant(rbCtx, (tx) =>
      tx.projectTask.count({ where: { approvalStatus: "Published" } }),
    );
    const result = await runCustomReport(rbCtx, "tasks", ["title", "status"]);
    // permissions ["*"] ⇒ project:write ⇒ PM lens on every board ⇒ all Published rows.
    expect(result.rows.length).toBe(published);
  });

  it("workload: self-scoped without report:resource:others", async () => {
    const me = await withTenant(rbCtx, (tx) =>
      tx.user.findFirst({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
    );
    if (!me) throw new Error("expected a seeded active Riverbank user");
    const selfCtx: TenantContext = {
      tenantId: riverbankId,
      userId: me.id,
      roles: ["Member"],
      permissions: ["report:resource:self"],
    };
    const [scoped, full] = await Promise.all([
      runCustomReport(selfCtx, "workload", ["name"]),
      runCustomReport(rbCtx, "workload", ["name"]),
    ]);
    expect(scoped.rows.length).toBeLessThanOrEqual(1);
    if (scoped.rows.length === 1) expect(scoped.rows[0].name).toBe(me.name);
    expect(full.rows.length).toBeGreaterThan(scoped.rows.length);
  });

  it("portfolio rows resolve owner names and counts", async () => {
    const result = await runCustomReport(rbCtx, "portfolios", ["name", "owner", "projects", "category"]);
    for (const row of result.rows) {
      expect(typeof row.name).toBe("string");
      expect(typeof row.projects).toBe("number");
    }
  });
});

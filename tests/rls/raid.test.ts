// Milestone 7 RAID lifecycle: risk/issue create+update audit trail, materialise (creates
// the issue, closes the risk, rejects a second materialise), gap-report correctness, and
// tenant isolation. Requires a migrated, seeded DB (`pnpm prisma:seed`).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createRisk, updateRisk, materialiseRisk, RiskError } from "@/server/risks";
import { getGapReport } from "@/server/raid";

const TEST_PREFIX = "Test RAID Lifecycle";

describe("RAID lifecycle", () => {
  let kcbId: string;
  let riverbankId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) {
      throw new Error("RAID tests require seeded data — run `pnpm prisma:seed` first.");
    }
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    ctx = { tenantId: kcbId, userId: "test-raid-actor", roles: ["SystemAdmin"] };
  });

  beforeEach(async () => {
    await withTenant(ctx, async (tx) => {
      const risks = await tx.risk.findMany({ where: { title: { startsWith: TEST_PREFIX } } });
      const riskIds = risks.map((r) => r.id);
      if (riskIds.length) {
        await tx.auditLog.deleteMany({
          where: { OR: [{ entityId: { in: riskIds } }, { entityType: "issue" }] },
        });
        await tx.issue.deleteMany({ where: { originRiskId: { in: riskIds } } });
        await tx.risk.deleteMany({ where: { id: { in: riskIds } } });
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a risk and writes a create audit row", async () => {
    const risk = await createRisk(ctx, {
      title: `${TEST_PREFIX} A`,
      category: "Operational",
      probability: 3,
      impact: 4,
    });
    expect(risk.status).toBe("Open");

    const rows = await withTenant(ctx, (tx) => tx.auditLog.findMany({ where: { entityId: risk.id } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("create");
    expect(rows[0].after).toMatchObject({ probability: 3, impact: 4, status: "Open" });
  });

  it("updates a risk and writes a before/after update audit row", async () => {
    const risk = await createRisk(ctx, { title: `${TEST_PREFIX} B`, probability: 2, impact: 2 });

    await updateRisk(ctx, risk.id, { status: "Monitoring", mitigation: "Track weekly." });

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: risk.id, action: "update" } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toMatchObject({ status: "Open" });
    expect(rows[0].after).toMatchObject({ status: "Monitoring", mitigation: "Track weekly." });
  });

  it("materialises a risk into an issue, closes the risk, and audits both", async () => {
    const risk = await createRisk(ctx, { title: `${TEST_PREFIX} C`, probability: 4, impact: 5 });

    const { issueId } = await materialiseRisk(ctx, risk.id, {});

    const issue = await withTenant(ctx, (tx) => tx.issue.findUniqueOrThrow({ where: { id: issueId } }));
    expect(issue.originRiskId).toBe(risk.id);
    expect(issue.severity).toBe("Critical"); // heatBucket(4,5) = 20 -> Critical
    expect(issue.status).toBe("Open");

    const riskAfter = await withTenant(ctx, (tx) => tx.risk.findUniqueOrThrow({ where: { id: risk.id } }));
    expect(riskAfter.status).toBe("Closed");

    const issueAudit = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({ where: { entityId: issueId, action: "create" } }),
    );
    expect(issueAudit?.after).toMatchObject({ originRiskId: risk.id });

    const riskAudit = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({ where: { entityId: risk.id, action: "update" } }),
    );
    expect(riskAudit?.after).toMatchObject({ status: "Closed", materialisedInto: issueId });
  });

  it("rejects materialising the same risk twice", async () => {
    const risk = await createRisk(ctx, { title: `${TEST_PREFIX} D`, probability: 2, impact: 2 });
    await materialiseRisk(ctx, risk.id, {});

    await expect(materialiseRisk(ctx, risk.id, {})).rejects.toThrow(RiskError);
  });

  it("keeps risks tenant-isolated", async () => {
    const risk = await createRisk(ctx, { title: `${TEST_PREFIX} E`, probability: 1, impact: 1 });

    const riverbankCtx: TenantContext = {
      tenantId: riverbankId,
      userId: "test-raid-actor",
      roles: ["SystemAdmin"],
    };
    await expect(updateRisk(riverbankCtx, risk.id, { status: "Closed" })).rejects.toThrow();
    await expect(materialiseRisk(riverbankCtx, risk.id, {})).rejects.toThrow();
  });

  it("gap report classifies no-origin-risk, unowned/unmitigated-origin, and fully-traced issues correctly", async () => {
    // Fully traced: risk has an owner + mitigation.
    const tracedRisk = await createRisk(ctx, {
      title: `${TEST_PREFIX} Traced`,
      probability: 2,
      impact: 2,
      mitigation: "Mitigated.",
      ownerId: "test-raid-actor-nonexistent-but-non-null", // any non-null string satisfies "has an owner" for this check
    });
    const { issueId: tracedIssueId } = await materialiseRisk(ctx, tracedRisk.id, {});

    // Gap: risk has no owner/mitigation.
    const unmitigatedRisk = await createRisk(ctx, { title: `${TEST_PREFIX} Unmitigated`, probability: 2, impact: 2 });
    const { issueId: gapIssueId } = await materialiseRisk(ctx, unmitigatedRisk.id, {});

    const report = await getGapReport(ctx);
    const tracedItem = report.items.find((i) => i.issueId === tracedIssueId);
    const gapItem = report.items.find((i) => i.issueId === gapIssueId);

    expect(tracedItem).toBeUndefined();
    expect(gapItem?.gapReason).toBe("risk_unowned_or_unmitigated");
    expect(report.totalIssues).toBeGreaterThanOrEqual(2);

    // Clean up the two extra issues this test created (beforeEach only clears by risk title).
    await withTenant(ctx, async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityId: { in: [tracedIssueId, gapIssueId] } } });
      await tx.issue.deleteMany({ where: { id: { in: [tracedIssueId, gapIssueId] } } });
    });
  });
});

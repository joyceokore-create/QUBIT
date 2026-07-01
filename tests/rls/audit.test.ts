// Proves audit() writes a correctly tenant-scoped row (docs/07-auth-rbac.md,
// docs/12-testing-qa.md "Audit" mandatory test). Requires a migrated, seeded DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { audit } from "@/lib/audit";

// Distinct from any seeded entity id, and cleaned up before each run below, so this
// suite is idempotent whether it's the first run or the hundredth.
const TEST_ENTITY_ID = "TEST-AUDIT-P001";

describe("audit()", () => {
  let kcbId: string;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) {
      throw new Error("Audit tests require seeded data — run `pnpm prisma:seed` first.");
    }
    kcbId = kcb.id;
  });

  beforeEach(async () => {
    await withTenant({ tenantId: kcbId, userId: "test-actor" }, (tx) =>
      tx.auditLog.deleteMany({
        where: { entityId: { in: [TEST_ENTITY_ID, "ROLLBACK-TEST"] } },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("writes a tenant-scoped row with actor, action, and before/after snapshots", async () => {
    const ctx = { tenantId: kcbId, userId: "test-actor" };

    await withTenant(ctx, async (tx) => {
      await audit(tx, ctx, {
        action: "update",
        entityType: "project",
        entityId: TEST_ENTITY_ID,
        before: { status: "Planning" },
        after: { status: "OnTrack" },
      });
    });

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: TEST_ENTITY_ID, action: "update" } }),
    );

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.tenantId).toBe(kcbId);
    expect(row.actorId).toBe("test-actor");
    expect(row.entityType).toBe("project");
    expect(row.before).toEqual({ status: "Planning" });
    expect(row.after).toEqual({ status: "OnTrack" });
  });

  it("is atomic with the mutation it accompanies — a rolled-back transaction writes no audit row", async () => {
    const ctx = { tenantId: kcbId, userId: "test-actor" };

    await expect(
      withTenant(ctx, async (tx) => {
        await audit(tx, ctx, {
          action: "delete",
          entityType: "project",
          entityId: "ROLLBACK-TEST",
        });
        throw new Error("simulated failure after the audit write");
      }),
    ).rejects.toThrow("simulated failure");

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: "ROLLBACK-TEST" } }),
    );
    expect(rows).toHaveLength(0);
  });
});

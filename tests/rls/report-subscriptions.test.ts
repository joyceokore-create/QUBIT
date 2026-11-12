// Milestone B — "Email me weekly": the viewer's own weekly-report subscription, idempotent
// both ways, audited on change, invisible across tenants.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { isSubscribed, subscribe, unsubscribe } from "@/server/report-subscriptions";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("Milestone B — report subscriptions", () => {
  let rbId: string;
  let dbId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [u] = await createUsers(rbId, 1, "sub");
    ctx = { tenantId: rbId, userId: u.id, roles: ["Executive"] };
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityType: "report_subscription", actorId: ctx.userId } });
      await tx.reportSubscription.deleteMany({ where: { userId: ctx.userId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("subscribes once, stays subscribed on a repeat, unsubscribes once — each change audited", async () => {
    expect(await isSubscribed(ctx)).toBe(false);
    expect(await subscribe(ctx)).toEqual({ subscribed: true, changed: true });
    expect(await subscribe(ctx)).toEqual({ subscribed: true, changed: false });
    expect(await isSubscribed(ctx)).toBe(true);
    const rows = await withTenant(ctx, (tx) => tx.reportSubscription.count({ where: { userId: ctx.userId } }));
    expect(rows).toBe(1);

    // Another tenant sees none of it.
    const other: TenantContext = { tenantId: dbId, userId: "intruder", roles: ["Executive"] };
    const foreign = await withTenant(other, (tx) => tx.reportSubscription.count({ where: { userId: ctx.userId } }));
    expect(foreign).toBe(0);

    expect(await unsubscribe(ctx)).toEqual({ subscribed: false, changed: true });
    expect(await unsubscribe(ctx)).toEqual({ subscribed: false, changed: false });
    expect(await isSubscribed(ctx)).toBe(false);
    const audits = await withTenant(ctx, (tx) => tx.auditLog.findMany({ where: { entityType: "report_subscription", actorId: ctx.userId }, select: { action: true } }));
    expect(audits.map((a) => a.action).sort()).toEqual(["create", "delete"]);
  });
});

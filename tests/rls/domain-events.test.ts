// M0 domain-event outbox (docs/16-revamp-plan.md §10): one emit inside the mutation's
// transaction → durable domain_event row + Notification fan-out, under RLS. The
// through-a-real-mutation path is covered by the existing join-request/task suites,
// which now flow through the outbox.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { emitDomainEvent } from "@/server/events";
import { ensureUsers, cleanupFixtureUsers } from "./_users";

describe("domain-event outbox", () => {
  let kcbId: string;
  let riverbankId: string;
  let recipientId: string;
  let actorId: string;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    const [actor, recipient] = await ensureUsers(kcbId, 2);
    actorId = actor.id;
    recipientId = recipient.id;
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.notification.deleteMany({ where: { kind: "outbox_test" } });
      await tx.domainEvent.deleteMany({ where: { type: { startsWith: "test." } } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("writes the event row and fans out notifications in the same transaction", async () => {
    await withTenant({ tenantId: kcbId, userId: actorId }, (tx) =>
      emitDomainEvent(tx, { tenantId: kcbId, userId: actorId }, {
        type: "test.something_happened",
        entityType: "project",
        entityId: "entity-1",
        payload: { detail: "x" },
        notify: [{ userId: recipientId, kind: "outbox_test", message: "Something happened", link: "/dashboard" }],
      }),
    );

    const event = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.domainEvent.findFirstOrThrow({ where: { type: "test.something_happened" } }),
    );
    expect(event.actorId).toBe(actorId);
    expect(event.entityType).toBe("project");
    expect((event.payload as { notified?: number }).notified).toBe(1);

    const notification = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.findFirstOrThrow({ where: { kind: "outbox_test", userId: recipientId } }),
    );
    expect(notification.message).toBe("Something happened");
    expect(notification.link).toBe("/dashboard");
  });

  it("rolls the event back with the mutation (outbox is transactional)", async () => {
    await expect(
      withTenant({ tenantId: kcbId, userId: actorId }, async (tx) => {
        await emitDomainEvent(tx, { tenantId: kcbId, userId: actorId }, {
          type: "test.rolled_back",
          entityType: "project",
          entityId: "entity-2",
        });
        throw new Error("boom — the mutation failed after emitting");
      }),
    ).rejects.toThrow("boom");

    const event = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.domainEvent.findFirst({ where: { type: "test.rolled_back" } }),
    );
    expect(event).toBeNull();
  });

  it("is tenant-isolated: tenant B cannot read tenant A's events", async () => {
    const fromOtherTenant = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.domainEvent.findMany({ where: { type: "test.something_happened" } }),
    );
    expect(fromOtherTenant).toHaveLength(0);
  });

  it("denies unscoped access entirely (no app.tenant_id → no rows)", async () => {
    const rows = await prisma.domainEvent.findMany({ where: { type: "test.something_happened" } });
    expect(rows).toHaveLength(0);
  });
});

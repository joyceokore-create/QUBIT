// UX fidelity Tier 1 — Admin Home › "Send Reminder" (users without MFA). Reminds only the
// caller's tenant, at most once per person per 24 hours, with one audit row per batch.
// Requires a migrated, seeded DB. Synthetic fixture users only; cleans up after itself.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { MFA_REMINDER_KIND, sendMfaReminders } from "@/server/mfa-reminders";
import { cleanupFixtureUsers, createUsers } from "./_users";

describe("MFA reminders", () => {
  const started = new Date();
  let rb: TenantContext;
  let b: TenantContext;
  let rbIds: string[] = [];
  let bIds: string[] = [];

  beforeAll(async () => {
    const [r, d] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!r || !d) throw new Error("Seed required.");
    const [rbUsers, bUsers] = await Promise.all([createUsers(r.id, 3, "mfarem"), createUsers(d.id, 2, "mfaremb")]);
    rb = { tenantId: r.id, userId: rbUsers[0].id, roles: ["PlatformSuperAdmin"] };
    b = { tenantId: d.id, userId: bUsers[0].id, roles: ["PlatformSuperAdmin"] };
    rbIds = rbUsers.map((u) => u.id);
    bIds = bUsers.map((u) => u.id);
  });

  afterAll(async () => {
    for (const [ctx, ids] of [[rb, rbIds], [b, bIds]] as const) {
      await withTenant(ctx, async (tx) => {
        // Every reminder this run created — the batch also reaches the tenant's other users.
        await tx.notification.deleteMany({ where: { kind: MFA_REMINDER_KIND, createdAt: { gte: started } } });
        void ids;
        await tx.auditLog.deleteMany({ where: { action: "mfa_reminder", actorId: ctx.userId } });
        await tx.domainEvent.deleteMany({ where: { type: "mfa.reminder_sent", actorId: ctx.userId } });
      });
    }
    await cleanupFixtureUsers(rb.tenantId);
    await cleanupFixtureUsers(b.tenantId);
    await prisma.$disconnect();
  });

  it("reminds this tenant's users without MFA (not the sender), once per 24 hours, with one audit row", async () => {
    const first = await sendMfaReminders(rb);
    expect(first.sent).toBeGreaterThanOrEqual(2);

    const mine = await withTenant(rb, (tx) => tx.notification.findMany({ where: { kind: MFA_REMINDER_KIND, userId: { in: rbIds } }, select: { userId: true, link: true } }));
    expect(mine.map((n) => n.userId).sort()).toEqual(rbIds.slice(1).sort()); // the sender is never reminded
    expect(mine.every((n) => n.link === "/settings/mfa")).toBe(true);

    const second = await sendMfaReminders(rb);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(2);

    const rows = await withTenant(rb, (tx) => tx.auditLog.findMany({ where: { action: "mfa_reminder", actorId: rb.userId } }));
    expect(rows).toHaveLength(1);
    const after = rows[0].after as { reminded: number; userIds: string[] };
    expect(after.reminded).toBe(first.sent);
    expect(after.userIds).toEqual(expect.arrayContaining(rbIds.slice(1)));
  });

  it("never reaches another tenant's users", async () => {
    const bNotes = await withTenant(b, (tx) => tx.notification.findMany({ where: { kind: MFA_REMINDER_KIND, userId: { in: bIds } } }));
    expect(bNotes).toHaveLength(0);
    const fromB = await withTenant(rb, (tx) => tx.notification.findMany({ where: { kind: MFA_REMINDER_KIND, userId: { in: bIds } } }));
    expect(fromB).toHaveLength(0);
  });
});

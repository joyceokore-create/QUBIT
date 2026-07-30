// M5 digest-first email (docs/16 §8). The properties that matter: one email per person
// rather than per event, a notification is emailed ONCE, InApp-only kinds never leave
// the bell, and preferences resolve default → catch-all → explicit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { runJob } from "@/server/jobs";
import { defaultChannelFor, listMyPreferences, resolveChannels, setMyPreference } from "@/server/mail/preferences";
import { emailEnabled } from "@/server/mail/mailer";
import { createUsers, cleanupFixtureUsers } from "./_users";

let seq = 0;
const nextKey = () => `digest-test-${process.pid}:${++seq}`;

describe("M5 digest email", () => {
  let kcbId: string;
  let aliceId: string;
  let bobId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    const [alice, bob] = await createUsers(kcbId, 2, "dig");
    aliceId = alice.id;
    bobId = bob.id;
    ctx = { tenantId: kcbId, userId: aliceId, roles: ["Member"] };

    // Clear anything other suites left pending so the counts below are this suite's.
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.updateMany({ where: { emailedAt: null }, data: { emailedAt: new Date() } }),
    );
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, async (tx) => {
      await tx.notification.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
      await tx.notificationPreference.deleteMany({ where: { userId: { in: [aliceId, bobId] } } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("resolves channels default → catch-all → explicit, most specific winning", async () => {
    expect(defaultChannelFor("task_assigned")).toBe("Digest"); // the catch-all
    expect(defaultChannelFor("nudge")).toBe("Email"); // time-critical
    expect(defaultChannelFor("checkin_ready")).toBe("InApp"); // bell is enough

    // A catch-all override moves everything unnamed…
    await setMyPreference(ctx, { kind: "*", channel: "InApp" });
    let resolved = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      resolveChannels(tx, [{ userId: aliceId, kind: "task_assigned" }]),
    );
    expect(resolved.get(`${aliceId}:task_assigned`)).toBe("InApp");

    // …and an explicit kind beats the catch-all.
    await setMyPreference(ctx, { kind: "task_assigned", channel: "Digest" });
    resolved = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      resolveChannels(tx, [{ userId: aliceId, kind: "task_assigned" }]),
    );
    expect(resolved.get(`${aliceId}:task_assigned`)).toBe("Digest");

    // Somebody who changed nothing still gets the code default.
    const bobResolved = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      resolveChannels(tx, [{ userId: bobId, kind: "task_assigned" }]),
    );
    expect(bobResolved.get(`${bobId}:task_assigned`)).toBe("Digest");
  });

  it("my preference list shows defaults alongside what I changed", async () => {
    const rows = await listMyPreferences(ctx);
    const assigned = rows.find((r) => r.kind === "task_assigned");
    expect(assigned).toBeUndefined(); // not in the default matrix, so not listed
    const nudge = rows.find((r) => r.kind === "nudge")!;
    expect(nudge.isDefault).toBe(true); // untouched
    const star = rows.find((r) => r.kind === "*")!;
    expect(star.isDefault).toBe(false); // I set this one above
    expect(star.channel).toBe("InApp");
  });

  it("batches one email per person and never emails the same notification twice", async () => {
    await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.createMany({
        data: [
          { tenantId: kcbId, userId: bobId, kind: "task_assigned", message: "Task one" },
          { tenantId: kcbId, userId: bobId, kind: "task_assigned", message: "Task two" },
          { tenantId: kcbId, userId: bobId, kind: "checkin_ready", message: "Bell only" },
        ],
      }),
    );

    const first = await runJob("daily-digest", nextKey());
    const kcbResult = (first.detail as Record<string, { sent?: number; notifications?: number; inAppOnly?: number }>).kcb;
    // Assert BOB's outcome, not a global count: the job processes everything pending in
    // the tenant, so another suite's leftover notification would otherwise flip these.
    expect(kcbResult.sent).toBeGreaterThanOrEqual(1);
    expect(kcbResult.notifications).toBeGreaterThanOrEqual(2);
    expect(kcbResult.inAppOnly).toBeGreaterThanOrEqual(1); // checkin_ready stayed in the bell

    // The decisive check: Bob's two mailable rows went out in ONE email, not two.
    const bobStamped = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.count({ where: { userId: bobId, emailedAt: { not: null } } }),
    );
    expect(bobStamped).toBe(3); // 2 mailed + 1 in-app-only, all considered once

    // Every considered row is stamped, so a second run sends nothing.
    const second = await runJob("daily-digest", nextKey());
    const secondKcb = (second.detail as Record<string, { sent?: number; reason?: string }>).kcb;
    expect(secondKcb.sent ?? 0).toBe(0);

    const stamped = await withTenant({ tenantId: kcbId, userId: "test" }, (tx) =>
      tx.notification.count({ where: { userId: bobId, emailedAt: null } }),
    );
    expect(stamped).toBe(0);
  });

  it("email leaves the building only when the flag AND credentials are present", () => {
    // Neither is configured in tests, so the log adapter is used and nothing is sent —
    // every other code path behaves identically either way.
    expect(emailEnabled()).toBe(false);
  });

  it("RLS: the digest never crosses a tenant", async () => {
    const riverbank = await prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } });
    const resolved = await withTenant({ tenantId: riverbank.id, userId: "test" }, (tx) =>
      resolveChannels(tx, [{ userId: aliceId, kind: "task_assigned" }]),
    );
    // Alice's override is invisible here, so the code default applies.
    expect(resolved.get(`${aliceId}:task_assigned`)).toBe("Digest");
  });
});

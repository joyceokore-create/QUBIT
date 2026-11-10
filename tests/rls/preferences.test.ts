// UX2 — tenant time zone (UX plan Q3/U5) and the per-person rollout layout (D11).
// Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getTenantTimeZone, getUiMode, setUiMode } from "@/server/preferences";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("UX2 preferences", () => {
  let rbId: string;
  let bId: string;
  let rbCtx: TenantContext;
  let bCtx: TenantContext;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[rbUser], [bUser]] = await Promise.all([createUsers(rbId, 1, "pref"), createUsers(bId, 1, "pref")]);
    rbCtx = { tenantId: rbId, userId: rbUser.id, roles: ["Member"] };
    bCtx = { tenantId: bId, userId: bUser.id, roles: ["Member"] };
  });

  afterAll(async () => {
    await withTenant(rbCtx, (tx) => tx.auditLog.deleteMany({ where: { entityType: "user", entityId: rbCtx.userId } }));
    await withTenant(bCtx, (tx) => tx.auditLog.deleteMany({ where: { entityType: "user", entityId: bCtx.userId } }));
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("every tenant starts on Africa/Nairobi", async () => {
    expect(await getTenantTimeZone(rbCtx)).toBe("Africa/Nairobi");
    expect(await getTenantTimeZone(bCtx)).toBe("Africa/Nairobi");
  });

  it("a person's layout choice is stored, read back and audited", async () => {
    await setUiMode(rbCtx, "classic");
    expect(await getUiMode(rbCtx)).toBe("classic");
    await setUiMode(rbCtx, "new");
    expect(await getUiMode(rbCtx)).toBe("new");
    const rows = await withTenant(rbCtx, (tx) =>
      tx.auditLog.findMany({ where: { entityType: "user", entityId: rbCtx.userId }, orderBy: { createdAt: "asc" }, select: { after: true, actorId: true } }),
    );
    expect(rows.map((r) => (r.after as { uiMode: string }).uiMode)).toEqual(["classic", "new"]);
    expect(rows.every((r) => r.actorId === rbCtx.userId)).toBe(true);
  });

  it("RLS: a context in tenant B can't change or read a tenant A user's layout", async () => {
    // Same user id, wrong tenant: the update matches no visible row and nothing changes.
    const crossCtx = { tenantId: bId, userId: rbCtx.userId };
    await setUiMode(crossCtx, "classic").catch(() => undefined);
    const stillNew = await withTenant(rbCtx, (tx) => tx.user.findUnique({ where: { id: rbCtx.userId }, select: { uiMode: true } }));
    expect(stillNew?.uiMode).toBe("new");
    const seenFromB = await withTenant(bCtx, (tx) => tx.user.findUnique({ where: { id: rbCtx.userId }, select: { uiMode: true } }));
    expect(seenFromB).toBeNull();
    // …and the refused change leaves no audit row in tenant B either.
    const strayAudit = await withTenant(bCtx, (tx) => tx.auditLog.count({ where: { entityType: "user", entityId: rbCtx.userId } }));
    expect(strayAudit).toBe(0);
  });
});

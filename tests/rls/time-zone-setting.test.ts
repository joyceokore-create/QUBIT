// UX11 (Q3) — Admin › Settings › Time zone. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getTenantTimeZone, setTenantTimeZone, TimeZoneError } from "@/server/preferences";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("UX11 tenant time zone", () => {
  let rbId: string;
  let bId: string;
  let admin: TenantContext;
  let head: TenantContext;
  let bCtx: TenantContext;
  let rbBefore: string;
  let bBefore: string;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !b) throw new Error("Seed required.");
    rbId = rb.id;
    bId = b.id;
    const [[a, h], [bu]] = await Promise.all([createUsers(rbId, 2, "tz"), createUsers(bId, 1, "tz")]);
    admin = { tenantId: rbId, userId: a.id, roles: ["PlatformSuperAdmin"] };
    head = { tenantId: rbId, userId: h.id, roles: ["HeadOfProjects"] };
    bCtx = { tenantId: bId, userId: bu.id, roles: ["PlatformSuperAdmin"] };
    [rbBefore, bBefore] = await Promise.all([getTenantTimeZone(admin), getTenantTimeZone(bCtx)]);
  });

  afterAll(async () => {
    await setTenantTimeZone(admin, rbBefore).catch(() => undefined);
    await cleanupFixtureUsers(rbId);
    await cleanupFixtureUsers(bId);
    await prisma.$disconnect();
  });

  it("lets a Super Admin change it, audited, without touching the other tenant", async () => {
    await setTenantTimeZone(admin, "Europe/London");
    expect(await getTenantTimeZone(admin)).toBe("Europe/London");
    expect(await getTenantTimeZone(bCtx)).toBe(bBefore);
    const row = await withTenant(admin, (tx) => tx.auditLog.findFirst({ where: { entityType: "tenant", entityId: rbId, actorId: admin.userId }, orderBy: { createdAt: "desc" } }));
    expect(row?.after).toMatchObject({ timeZone: "Europe/London" });
  });

  it("refuses anyone else, and an unknown zone", async () => {
    await expect(setTenantTimeZone(head, "Asia/Tokyo")).rejects.toBeInstanceOf(TimeZoneError);
    await expect(setTenantTimeZone(admin, "Mars/Olympus_Mons")).rejects.toThrow(/time zone/);
  });
});

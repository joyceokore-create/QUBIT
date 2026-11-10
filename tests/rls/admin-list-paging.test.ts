// UX5 (L4) — server-side paging, search and filters for Admin › Users, Audit log and Access
// requests. Proves the right slice + total, that filters narrow, that search reaches rows
// beyond page 1, that pages clamp, that page size is capped at 100 — and, for the
// tenant-scoped lists, that Riverbank never sees Demo Org B rows and vice versa.
// Requires a migrated, seeded DB. Synthetic data only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { parseListParams } from "@/lib/list-state";
import { dayRange } from "@/lib/list-query";
import { listUsersPaged, userDirectoryStats, listUserOptions } from "@/server/users";
import { auditFilterOptions, listAuditLogPaged } from "@/server/audit";
import { accessRequestTotals, listAccessRequestsPaged } from "@/server/access-requests";
import { cleanupFixtureUsers } from "./_users";

const TAG = `pg${Date.now().toString(36)}`;
const pad = (n: number) => String(n).padStart(3, "0");

let rbId: string;
let bId: string;
let rb: TenantContext;
let b: TenantContext;
const rbUserIds: string[] = [];
const bUserIds: string[] = [];
let deptId: string;

async function makeUsers(tenantId: string, n: number, prefix: string, ids: string[]) {
  await withTenant({ tenantId, userId: "seed" }, async (tx) => {
    for (let i = 1; i <= n; i++) {
      const u = await tx.user.create({
        data: { tenantId, name: `user_paged_${TAG}_${prefix}${pad(i)}`, email: `user_paged_${TAG}_${prefix}${pad(i)}@fixture.invalid`, status: "ACTIVE" },
        select: { id: true },
      });
      ids.push(u.id);
    }
  });
}

beforeAll(async () => {
  const [r, d] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
  if (!r || !d) throw new Error("Seed required — run `pnpm prisma db seed` first.");
  rbId = r.id;
  bId = d.id;
  rb = { tenantId: rbId, userId: "test-paged-actor", roles: ["PlatformSuperAdmin"] };
  b = { tenantId: bId, userId: "test-paged-actor", roles: ["PlatformSuperAdmin"] };

  // Riverbank: 13 users (001–013). Demo Org B: 3 users with the SAME name prefix.
  await makeUsers(rbId, 13, "", rbUserIds);
  await makeUsers(bId, 3, "", bUserIds);

  await withTenant(rb, async (tx) => {
    deptId = (await tx.department.create({ data: { tenantId: rbId, name: `Paged Dept ${TAG}` }, select: { id: true } })).id;
    // 4 suspended (010–013), 5 with MFA (001–005), 3 Executives (001–003), 2 in the department (006–007),
    // 2 signed in (008–009).
    await tx.user.updateMany({ where: { id: { in: rbUserIds.slice(9) } }, data: { status: "SUSPENDED" } });
    await tx.user.updateMany({ where: { id: { in: rbUserIds.slice(0, 5) } }, data: { mfaSecret: "synthetic-not-a-secret" } });
    await tx.roleAssignment.createMany({ data: rbUserIds.slice(0, 3).map((userId) => ({ tenantId: rbId, userId, role: "Executive" })) });
    await tx.user.updateMany({ where: { id: { in: rbUserIds.slice(5, 7) } }, data: { departmentId: deptId } });
    await tx.user.updateMany({ where: { id: { in: rbUserIds.slice(7, 9) } }, data: { lastLoginAt: new Date() } });
  });
});

afterAll(async () => {
  await withTenant(rb, async (tx) => {
    await tx.user.updateMany({ where: { id: { in: rbUserIds } }, data: { departmentId: null } });
    await tx.department.deleteMany({ where: { id: deptId } });
  });
  await cleanupFixtureUsers(rbId);
  await cleanupFixtureUsers(bId);
  await prisma.$disconnect();
});

describe("Admin › Users — listUsersPaged", () => {
  it("returns the right slice and total, sorted by name", async () => {
    const p1 = await listUsersPaged(rb, { q: TAG, page: 1, size: 5 });
    expect(p1.info).toMatchObject({ total: 13, page: 1, pageCount: 3, from: 1, to: 5 });
    expect(p1.rows.map((u) => u.name)).toEqual([1, 2, 3, 4, 5].map((i) => `user_paged_${TAG}_${pad(i)}`));
    const p3 = await listUsersPaged(rb, { q: TAG, page: 3, size: 5 });
    expect(p3.rows.map((u) => u.id)).toEqual(rbUserIds.slice(10));
    expect(p3.info).toMatchObject({ from: 11, to: 13 });
  });

  it("search finds a row that is not on page 1", async () => {
    const p1 = await listUsersPaged(rb, { q: TAG, page: 1, size: 5 });
    expect(p1.rows.some((u) => u.id === rbUserIds[11])).toBe(false);
    const hit = await listUsersPaged(rb, { q: `${TAG}_012`, page: 1, size: 5 });
    expect(hit.rows.map((u) => u.id)).toEqual([rbUserIds[11]]);
    // email matches too, case-insensitively
    const byEmail = await listUsersPaged(rb, { q: `USER_PAGED_${TAG.toUpperCase()}_012@FIXTURE`, page: 1, size: 5 });
    expect(byEmail.info.total).toBe(1);
  });

  it("treats LIKE wildcards in the search as literal text", async () => {
    expect((await listUsersPaged(rb, { q: "%", page: 1, size: 5 })).info.total).toBe(0);
    expect((await listUsersPaged(rb, { q: `user%paged_${TAG}`, page: 1, size: 5 })).info.total).toBe(0);
  });

  it("filters narrow: status, MFA, role, department, onboarding", async () => {
    const count = async (extra: Omit<Parameters<typeof listUsersPaged>[1], "q" | "page" | "size">) =>
      (await listUsersPaged(rb, { q: TAG, page: 1, size: 100, ...extra })).info.total;
    expect(await count({ status: "SUSPENDED" })).toBe(4);
    expect(await count({ status: "ACTIVE" })).toBe(9);
    expect(await count({ mfa: "on" })).toBe(5);
    expect(await count({ mfa: "off" })).toBe(8);
    expect(await count({ role: "Executive" })).toBe(3);
    expect(await count({ role: "Executive", mfa: "off" })).toBe(0);
    expect(await count({ department: deptId })).toBe(2);
    expect(await count({ department: "none" })).toBe(11);
    expect(await count({ status: "ACTIVE", onboarding: "not-signed-in" })).toBe(7);
    expect(await count({ onboarding: "unplaced" })).toBe(13);
  });

  it("RLS: Riverbank never sees Demo Org B users, and vice versa", async () => {
    const a = await listUsersPaged(rb, { q: TAG, page: 1, size: 100 });
    expect(a.info.total).toBe(13);
    expect(a.rows.some((u) => bUserIds.includes(u.id))).toBe(false);
    const other = await listUsersPaged(b, { q: TAG, page: 1, size: 100 });
    expect(other.info.total).toBe(3);
    expect(other.rows.map((u) => u.id).sort()).toEqual([...bUserIds].sort());
    // A Riverbank department id used as a filter from tenant B finds nothing.
    expect((await listUsersPaged(b, { q: TAG, page: 1, size: 100, department: deptId })).info.total).toBe(0);
    // Stats and the manager picker are tenant-scoped too.
    expect((await listUserOptions(b)).some((u) => rbUserIds.includes(u.id))).toBe(false);
    const bLive = await withTenant(b, (tx) => tx.user.count({ where: { status: { not: "DELETED" } } }));
    expect((await userDirectoryStats(b, { sso: false })).all).toBe(bLive);
  });

  it("an out-of-range page clamps to the last page", async () => {
    const r = await listUsersPaged(rb, { q: TAG, page: 99, size: 5 });
    expect(r.info.page).toBe(3);
    expect(r.rows).toHaveLength(3);
  });

  it("page size above 100 is rejected by the engine and dropped by the URL parser", async () => {
    await expect(listUsersPaged(rb, { q: TAG, page: 1, size: 500 })).rejects.toThrow();
    expect(parseListParams({ size: "500" }, { defaultSize: 10, filters: {} }).size).toBe(10);
    expect(parseListParams({ size: "100" }, { defaultSize: 10, filters: {} }).size).toBe(100);
  });

  it("the URL parser drops filter values outside the allow-list", () => {
    const p = parseListParams(
      { role: "NotARole", status: "DELETED", mfa: "maybe", department: "x' OR 1=1 --", page: "-3" },
      { defaultSize: 10, filters: { role: ["Executive"], status: ["ACTIVE", "INVITED", "SUSPENDED"], mfa: ["on", "off"], department: [deptId, "none"] } },
    );
    expect(p.filters).toEqual({});
    expect(p.page).toBe(1);
  });

  it("directory stats count the whole directory, not the page", async () => {
    const s = await userDirectoryStats(rb, { sso: false });
    expect(s.suspended).toBeGreaterThanOrEqual(4);
    expect(s.all).toBeGreaterThanOrEqual(13);
  });
});

describe("Admin › Audit log — listAuditLogPaged", () => {
  const ACTION = `paged_test_${TAG}`;
  // 12 Riverbank rows, one per hour back from a fixed instant; row 001 is the newest.
  const base = new Date("2026-11-09T09:00:00.000Z");
  const at = (i: number) => new Date(base.getTime() - (i - 1) * 3_600_000);

  beforeAll(async () => {
    await withTenant(rb, (tx) =>
      tx.auditLog.createMany({
        data: Array.from({ length: 12 }, (_, k) => ({
          tenantId: rbId,
          actorId: k < 4 ? rbUserIds[0] : rbUserIds[1],
          action: ACTION,
          entityType: "paged_fixture",
          entityId: `ent_${TAG}_${pad(k + 1)}`,
          createdAt: at(k + 1),
        })),
      }),
    );
    // 22:00 UTC on 8 Nov = 01:00 on 9 Nov in Nairobi — the tenant-local day boundary case.
    await withTenant(rb, (tx) =>
      tx.auditLog.create({ data: { tenantId: rbId, actorId: rbUserIds[2], action: `${ACTION}_tz`, entityType: "paged_fixture", entityId: `ent_${TAG}_tz`, createdAt: new Date("2026-11-08T22:00:00.000Z") } }),
    );
    await withTenant(b, (tx) =>
      tx.auditLog.createMany({
        data: Array.from({ length: 3 }, (_, k) => ({ tenantId: bId, actorId: bUserIds[0], action: ACTION, entityType: "paged_fixture", entityId: `ent_${TAG}_b${pad(k + 1)}`, createdAt: at(k + 1) })),
      }),
    );
  });

  afterAll(async () => {
    await withTenant(rb, (tx) => tx.auditLog.deleteMany({ where: { action: { startsWith: ACTION } } }));
    await withTenant(b, (tx) => tx.auditLog.deleteMany({ where: { action: { startsWith: ACTION } } }));
  });

  it("returns the right slice and total, newest first", async () => {
    const p1 = await listAuditLogPaged(rb, { page: 1, size: 5, action: ACTION });
    expect(p1.info).toMatchObject({ total: 12, pageCount: 3, from: 1, to: 5 });
    expect(p1.rows.map((r) => r.entityId)).toEqual([1, 2, 3, 4, 5].map((i) => `ent_${TAG}_${pad(i)}`));
    expect(p1.rows[0].actorName).toBe(`user_paged_${TAG}_001`);
    const p3 = await listAuditLogPaged(rb, { page: 3, size: 5, action: ACTION });
    expect(p3.rows.map((r) => r.entityId)).toEqual([11, 12].map((i) => `ent_${TAG}_${pad(i)}`));
  });

  it("search finds a row that is not on page 1", async () => {
    const hit = await listAuditLogPaged(rb, { q: `ent_${TAG}_011`, page: 1, size: 5 });
    expect(hit.rows.map((r) => r.entityId)).toEqual([`ent_${TAG}_011`]);
  });

  it("filters narrow: actor and date range", async () => {
    expect((await listAuditLogPaged(rb, { page: 1, size: 100, action: ACTION, actor: rbUserIds[0] })).info.total).toBe(4);
    // rows 001–003 fall in [07:00, 09:00] UTC
    const window = await listAuditLogPaged(rb, { page: 1, size: 100, action: ACTION, from: new Date("2026-11-09T07:00:00Z"), to: new Date("2026-11-09T09:00:01Z") });
    expect(window.info.total).toBe(3);
  });

  it("date-range days are tenant-local (Africa/Nairobi)", async () => {
    const nairobi = dayRange("2026-11-09", "2026-11-09", "Africa/Nairobi");
    const inNairobi = await listAuditLogPaged(rb, { page: 1, size: 100, action: `${ACTION}_tz`, from: nairobi.gte, to: nairobi.lt });
    expect(inNairobi.info.total).toBe(1);
    const utc = dayRange("2026-11-09", "2026-11-09", "UTC");
    const inUtc = await listAuditLogPaged(rb, { page: 1, size: 100, action: `${ACTION}_tz`, from: utc.gte, to: utc.lt });
    expect(inUtc.info.total).toBe(0);
  });

  it("RLS: Riverbank never sees Demo Org B audit rows, and vice versa", async () => {
    const a = await listAuditLogPaged(rb, { page: 1, size: 100, q: TAG });
    expect(a.rows.some((r) => r.entityId.includes(`${TAG}_b`))).toBe(false);
    const other = await listAuditLogPaged(b, { page: 1, size: 100, q: TAG });
    expect(other.info.total).toBe(3);
    expect(other.rows.every((r) => r.entityId.startsWith(`ent_${TAG}_b`))).toBe(true);
    // Filtering B by a Riverbank actor finds nothing.
    expect((await listAuditLogPaged(b, { page: 1, size: 100, actor: rbUserIds[0] })).info.total).toBe(0);
    // Filter options (the allow-lists) are tenant-scoped.
    const bOpts = await auditFilterOptions(b);
    expect(bOpts.actors.some((a) => rbUserIds.includes(a.id))).toBe(false);
    const rbOpts = await auditFilterOptions(rb);
    expect(rbOpts.actions).toContain(ACTION);
    expect(rbOpts.actors.some((a) => a.id === rbUserIds[0] && a.name === `user_paged_${TAG}_001`)).toBe(true);
    expect(rbOpts.actors.some((a) => bUserIds.includes(a.id))).toBe(false);
  });

  it("an out-of-range page clamps; page size above 100 is rejected", async () => {
    const r = await listAuditLogPaged(rb, { page: 50, size: 5, action: ACTION });
    expect(r.info.page).toBe(3);
    expect(r.rows).toHaveLength(2);
    await expect(listAuditLogPaged(rb, { page: 1, size: 101 })).rejects.toThrow();
  });
});

describe("Admin › Access requests — listAccessRequestsPaged (system table, no tenant)", () => {
  const statuses = ["NEW", "NEW", "NEW", "REVIEWED", "REVIEWED", "DISMISSED", "DISMISSED"] as const;

  beforeAll(async () => {
    await prisma.accessRequest.createMany({
      data: statuses.map((status, k) => ({
        fullName: `user_paged_ar_${TAG}_${pad(k + 1)}`,
        email: `ar_${TAG}_${pad(k + 1)}@example.invalid`,
        company: `Paged Co ${TAG}`,
        status,
        createdAt: new Date(Date.UTC(2026, 10, 1, 12, k)),
      })),
    });
  });

  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: { startsWith: `ar_${TAG}_` } } });
  });

  it("returns the right slice and total — NEW first, then newest", async () => {
    const p1 = await listAccessRequestsPaged({ q: TAG, page: 1, size: 5 });
    expect(p1.info).toMatchObject({ total: 7, pageCount: 2, from: 1, to: 5 });
    expect(p1.rows.map((r) => r.status)).toEqual(["NEW", "NEW", "NEW", "REVIEWED", "REVIEWED"]);
    // within NEW, newest first (003 was created last)
    expect(p1.rows[0].email).toBe(`ar_${TAG}_003@example.invalid`);
    const p2 = await listAccessRequestsPaged({ q: TAG, page: 2, size: 5 });
    expect(p2.rows.map((r) => r.status)).toEqual(["DISMISSED", "DISMISSED"]);
  });

  it("status filter narrows; search covers name, email and company", async () => {
    expect((await listAccessRequestsPaged({ q: TAG, page: 1, size: 5, status: "DISMISSED" })).info.total).toBe(2);
    expect((await listAccessRequestsPaged({ q: `ar_${TAG}_007@`, page: 1, size: 5 })).info.total).toBe(1);
    expect((await listAccessRequestsPaged({ q: `user_paged_ar_${TAG}_006`, page: 1, size: 5 })).info.total).toBe(1);
    expect((await listAccessRequestsPaged({ q: `paged co ${TAG}`, page: 1, size: 5 })).info.total).toBe(7);
  });

  it("an out-of-range page clamps; page size above 100 is rejected", async () => {
    const r = await listAccessRequestsPaged({ q: TAG, page: 9, size: 5 });
    expect(r.info.page).toBe(2);
    expect(r.rows).toHaveLength(2);
    await expect(listAccessRequestsPaged({ q: TAG, page: 1, size: 1000 })).rejects.toThrow();
  });

  it("totals count everything and the NEW ones", async () => {
    const t = await accessRequestTotals();
    expect(t.total).toBeGreaterThanOrEqual(7);
    expect(t.new).toBeGreaterThanOrEqual(3);
  });
});

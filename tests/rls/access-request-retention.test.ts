// UX fidelity D-F3b — access-request retention. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { purgeDecidedAccessRequests } from "@/server/access-requests";
import { getAccessRequestRetentionDays, PlatformSettingError, setAccessRequestRetentionDays } from "@/server/platform-settings";
import { runJob } from "@/server/jobs";

const TAG = `retention_${Date.now()}`;
const DAY = 86_400_000;

describe("access-request retention", () => {
  let sa: TenantContext;
  let head: TenantContext;
  let bCtx: TenantContext;
  let before: unknown;

  beforeAll(async () => {
    const [rb, b] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { slug: "riverbank" } }),
      prisma.tenant.findUniqueOrThrow({ where: { slug: "demo-b" } }),
    ]);
    sa = { tenantId: rb.id, userId: `${TAG}_sa`, roles: ["PlatformSuperAdmin"], permissions: ["*"] };
    head = { tenantId: rb.id, userId: `${TAG}_head`, roles: ["HeadOfProjects"], permissions: ["iam:manage"] };
    bCtx = { tenantId: b.id, userId: `${TAG}_b`, roles: ["PlatformSuperAdmin"], permissions: ["*"] };
    before = (await prisma.platformSetting.findUnique({ where: { key: "accessRequestRetentionDays" } }))?.value ?? null;
  });

  afterAll(async () => {
    await prisma.accessRequest.deleteMany({ where: { email: { startsWith: TAG } } });
    if (before === null) await prisma.platformSetting.deleteMany({ where: { key: "accessRequestRetentionDays" } });
    else await prisma.platformSetting.update({ where: { key: "accessRequestRetentionDays" }, data: { value: before as number } });
    for (const ctx of [sa, bCtx]) {
      await withTenant(ctx, (tx) => tx.auditLog.deleteMany({ where: { entityType: "platform_setting", actorId: ctx.userId } }));
    }
    await prisma.jobRun.deleteMany({ where: { idempotencyKey: { startsWith: TAG } } });
    await prisma.$disconnect();
  });

  it("deletes only decided requests older than N days; waiting ones are never deleted", async () => {
    // A fixed "now" in 2000, so the purge can only ever reach this test's own rows — real
    // requests (all decided after 2000) are never older than this cutoff.
    const now = new Date("2000-03-01T00:00:00Z");
    const old = new Date(now.getTime() - 40 * DAY);
    const recent = new Date(now.getTime() - 5 * DAY);
    const mk = (suffix: string, data: Record<string, unknown>) =>
      prisma.accessRequest.create({ data: { fullName: `user_${TAG}_${suffix}`, email: `${TAG}_${suffix}@example.invalid`, company: "Synthetic Co", ...data } });
    const oldApproved = await mk("a", { status: "REVIEWED", reviewedAt: old, createdAt: old });
    const oldDeclined = await mk("d", { status: "DISMISSED", reviewedAt: old, createdAt: old });
    const recentDeclined = await mk("r", { status: "DISMISSED", reviewedAt: recent, createdAt: old });
    const oldWaiting = await mk("w", { createdAt: old });

    const deleted = await purgeDecidedAccessRequests(30, now);
    expect(deleted).toBe(2);
    const left = new Set((await prisma.accessRequest.findMany({ where: { email: { startsWith: TAG } }, select: { id: true } })).map((r) => r.id));
    expect(left.has(oldApproved.id)).toBe(false);
    expect(left.has(oldDeclined.id)).toBe(false);
    expect(left.has(recentDeclined.id)).toBe(true);
    expect(left.has(oldWaiting.id)).toBe(true);
  });

  it("only a Super Admin can change the setting; the range is 7–365; changes are audited in their tenant only", async () => {
    await expect(setAccessRequestRetentionDays(head, 14)).rejects.toBeInstanceOf(PlatformSettingError);
    await expect(setAccessRequestRetentionDays(sa, 6)).rejects.toBeInstanceOf(PlatformSettingError);
    await expect(setAccessRequestRetentionDays(sa, 366)).rejects.toBeInstanceOf(PlatformSettingError);

    const prior = await getAccessRequestRetentionDays();
    expect(await setAccessRequestRetentionDays(sa, 14)).toBe(14);
    expect(await getAccessRequestRetentionDays()).toBe(14);

    const row = await withTenant(sa, (tx) => tx.auditLog.findFirst({ where: { entityType: "platform_setting", actorId: sa.userId }, orderBy: { createdAt: "desc" } }));
    expect(row?.before).toEqual({ accessRequestRetentionDays: prior });
    expect(row?.after).toEqual({ accessRequestRetentionDays: 14 });
    expect(await withTenant(bCtx, (tx) => tx.auditLog.count({ where: { entityType: "platform_setting", actorId: sa.userId } }))).toBe(0);
    await setAccessRequestRetentionDays(sa, prior); // put it back before the job test runs
  });

  it("the nightly job runs once (not per tenant) and records counts only", async () => {
    const result = await runJob("access-request-retention", `${TAG}:run`);
    expect(result.status).toBe("Succeeded");
    expect(Object.keys(result.detail ?? {}).sort()).toEqual(["days", "deleted"]);
    expect(JSON.stringify(result.detail)).not.toContain("@");
  });
});

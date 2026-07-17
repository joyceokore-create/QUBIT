// Milestone 6 subsidiary view: KPI counts, per-org-unit status/progress (not the project's
// overall rollup), filtering, and tenant isolation. Requires a migrated, seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { getSubsidiaryDetail } from "@/server/subsidiaries";

describe("Subsidiary view", () => {
  let kcbId: string;
  let riverbankId: string;
  let ctx: TenantContext;
  let keOrgUnitId: string;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) {
      throw new Error("Subsidiary tests require seeded data — run `pnpm prisma:seed` first.");
    }
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    ctx = { tenantId: kcbId, userId: "test-subsidiary-actor", roles: ["PlatformSuperAdmin"] };

    const ke = await withTenant(ctx, (tx) => tx.orgUnit.findFirstOrThrow({ where: { code: "KE" } }));
    keOrgUnitId = ke.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns null for an org unit that doesn't exist in this tenant", async () => {
    const result = await getSubsidiaryDetail(ctx, "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("computes KPI counts scoped to this org unit's ProjectOrgStatus rows", async () => {
    const detail = await getSubsidiaryDetail(ctx, keOrgUnitId);
    expect(detail).not.toBeNull();

    const raw = await withTenant(ctx, (tx) =>
      tx.projectOrgStatus.findMany({ where: { orgUnitId: keOrgUnitId }, select: { status: true } }),
    );
    expect(detail!.totalItems).toBe(raw.length);
    expect(detail!.onTrack).toBe(raw.filter((r) => r.status === "OnTrack").length);
    expect(detail!.atRisk).toBe(raw.filter((r) => r.status === "AtRisk").length);
    expect(detail!.overdue).toBe(raw.filter((r) => r.status === "Overdue").length);
    expect(detail!.projects).toHaveLength(raw.length);
  });

  it("shows the project's status/progress for THIS subsidiary, not the project's overall rollup", async () => {
    const detail = await getSubsidiaryDetail(ctx, keOrgUnitId);
    const row = detail!.projects[0];

    const rawStatus = await withTenant(ctx, (tx) =>
      tx.projectOrgStatus.findFirstOrThrow({
        where: { orgUnitId: keOrgUnitId, projectId: row.id },
      }),
    );
    expect(row.status).toBe(rawStatus.status);
    expect(row.progress).toBe(rawStatus.progress);
  });

  it("filters by status and by search text", async () => {
    const detail = await getSubsidiaryDetail(ctx, keOrgUnitId);
    const onTrackRows = detail!.projects.filter((p) => p.status === "OnTrack");

    const filtered = await getSubsidiaryDetail(ctx, keOrgUnitId, { status: "OnTrack" });
    expect(filtered!.projects).toHaveLength(onTrackRows.length);
    expect(filtered!.projects.every((p) => p.status === "OnTrack")).toBe(true);
    // KPI counts are unaffected by the filter — they reflect the whole subsidiary.
    expect(filtered!.totalItems).toBe(detail!.totalItems);

    if (detail!.projects.length > 0) {
      const target = detail!.projects[0];
      const bySearch = await getSubsidiaryDetail(ctx, keOrgUnitId, { q: target.name.slice(0, 5) });
      expect(bySearch!.projects.some((p) => p.id === target.id)).toBe(true);
    }
  });

  it("keeps subsidiary data tenant-isolated", async () => {
    const riverbankCtx: TenantContext = {
      tenantId: riverbankId,
      userId: "test-subsidiary-actor",
      roles: ["PlatformSuperAdmin"],
    };
    const result = await getSubsidiaryDetail(riverbankCtx, keOrgUnitId);
    expect(result).toBeNull();
  });
});

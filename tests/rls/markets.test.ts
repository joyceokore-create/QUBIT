// docs/38 (I1) — instances: add from the org units the label allows, scoped gates per
// instance, an instance lead who runs the product under pmScope = instance, retire only
// without open work, and the other tenant sees nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { canWriteProject } from "@/lib/access";
import { addMarkets, getMarketSetup, MarketError, listAddableMarkets, listProjectMarkets, retireMarket, updateMarket } from "@/server/markets";
import { getProjectCheckpoints, setCheckpointState } from "@/server/checkpoints";
import { shouldOfferTour } from "@/server/tour";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("markets (docs/38 I1)", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let lead: TenantContext;
  let projectId: string;
  let marketA: string;
  let marketB: string;
  let internal: string;
  let templateId: string | null = null;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [p, l] = await createUsers(rbId, 2, "mkt");
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    lead = { tenantId: rbId, userId: l.id, roles: ["Member"] };
    await withTenant(pm, async (tx) => {
      const markets = await tx.orgUnit.findMany({ where: { kind: "Market" }, select: { id: true }, orderBy: { code: "asc" }, take: 2 });
      marketA = markets[0]!.id;
      marketB = markets[1]!.id;
      internal = (await tx.orgUnit.findFirstOrThrow({ where: { kind: "Internal" }, select: { id: true } })).id;
      templateId = (await tx.checkpointTemplate.findFirst({ select: { id: true } }))?.id ?? null;
      projectId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "MKT-A", name: "Markets fixture", type: "Project", priority: "Med", status: "Planning", leadUserId: p.id, pmScope: "instance", checkpointTemplateId: templateId },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await withTenant(pm, async (tx) => {
      await tx.auditLog.deleteMany({ where: { actorId: { in: [pm.userId, lead.userId] } } });
      await tx.domainEvent.deleteMany({ where: { actorId: { in: [pm.userId, lead.userId] } } }).catch(() => {});
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("adds markets (markets and subsidiaries alike), refuses unknown units, and lists what is left", async () => {
    const rows = await addMarkets(pm, projectId, { orgUnitIds: [marketA, marketB] });
    expect(rows.map((r) => r.orgUnitId).sort()).toEqual([marketA, marketB].sort());
    await expect(addMarkets(pm, projectId, { orgUnitIds: ["00000000-0000-4000-8000-000000000000"] })).rejects.toMatchObject({ code: "NOT_FOUND" } satisfies Partial<MarketError>);
    const addable = await listAddableMarkets(pm, projectId);
    expect(addable.every((u) => u.id !== marketA && u.id !== marketB)).toBe(true);
    expect(addable.some((u) => u.id === internal)).toBe(true);
    // Idempotent: adding again changes nothing.
    expect((await addMarkets(pm, projectId, { orgUnitIds: [marketA] })).length).toBe(2);
  });

  it("records gate states per market without touching the product's track", async () => {
    if (!templateId) return;
    const product = await getProjectCheckpoints(pm, projectId);
    const first = product.rows[0]!.checkpointId;
    await setCheckpointState(pm, projectId, { checkpointId: first, state: "InProgress" }, { orgUnitId: marketA });
    expect((await getProjectCheckpoints(pm, projectId, { orgUnitId: marketA })).rows[0]!.state).toBe("InProgress");
    expect((await getProjectCheckpoints(pm, projectId, { orgUnitId: marketB })).rows[0]!.state).toBe("NotStarted");
    expect((await getProjectCheckpoints(pm, projectId)).rows[0]!.state).toBe("NotStarted");
    expect((await listProjectMarkets(pm, projectId)).find((i) => i.orgUnitId === marketA)!.progress).toBeGreaterThan(0);
    await expect(setCheckpointState(pm, projectId, { checkpointId: first, state: "InProgress" }, { orgUnitId: internal })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getMarketSetup(pm, projectId, marketA)).gates).toBe(true);
    expect((await getMarketSetup(pm, projectId, marketB)).gates).toBe(false);
  });

  it("a market lead runs the product under pmScope = instance", async () => {
    expect(await canWriteProject(lead, projectId)).toBe(false);
    expect((await shouldOfferTour(lead)).projectCount).toBe(0);
    await updateMarket(pm, projectId, marketA, { leadUserId: lead.userId, note: "Pilot first" });
    expect(await canWriteProject(lead, projectId)).toBe(true);
    expect((await shouldOfferTour(lead)).projects.map((p) => p.id)).toContain(projectId);
    expect((await getMarketSetup(pm, projectId, marketA)).lead).toBe(true);
    // Flip the project to a product-level PM: the instance lead no longer counts.
    await withTenant(pm, (tx) => tx.project.update({ where: { id: projectId }, data: { pmScope: "product" } }));
    expect(await canWriteProject(lead, projectId)).toBe(false);
    await withTenant(pm, (tx) => tx.project.update({ where: { id: projectId }, data: { pmScope: "instance" } }));
    const audits = await withTenant(pm, (tx) => tx.auditLog.findMany({ where: { entityType: "project_market", actorId: pm.userId }, select: { action: true } }));
    expect(audits.length).toBeGreaterThanOrEqual(3);
  });

  it("retires a market only when nothing open is tagged to it, and keeps the row", async () => {
    const blocker = await withTenant(pm, (tx) => tx.blocker.create({ data: { tenantId: rbId, projectId, orgUnitId: marketB, description: "Local partner contract", severity: "Medium", status: "Open" }, select: { id: true } }));
    await expect(retireMarket(pm, projectId, marketB)).rejects.toMatchObject({ code: "HAS_WORK" });
    await withTenant(pm, (tx) => tx.blocker.update({ where: { id: blocker.id }, data: { status: "Resolved" } }));
    const rows = await retireMarket(pm, projectId, marketB);
    expect(rows.map((r) => r.orgUnitId)).toEqual([marketA]);
    expect((await listProjectMarkets(pm, projectId, { includeRetired: true })).find((r) => r.orgUnitId === marketB)?.retiredAt).toBeTruthy();
    // Revive by adding again.
    expect((await addMarkets(pm, projectId, { orgUnitIds: [marketB] })).length).toBe(2);
  });

  it("the other tenant sees none of it", async () => {
    const other: TenantContext = { tenantId: dbId, userId: "seed", roles: ["PlatformSuperAdmin"] };
    await expect(listProjectMarkets(other, projectId)).resolves.toEqual([]);
    await expect(addMarkets(other, projectId, { orgUnitIds: [marketA] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// docs/38 — named instances (Asset Valuation "for Schools" …): created with a code, each
// with its own gate states per market (the same track everywhere) and a state per market;
// removable only while empty; invisible to the other tenant.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { addMarkets } from "@/server/markets";
import { createProjectInstance, instanceCode, listProjectInstances, ProjectInstanceError, removeProjectInstance, setInstanceState, updateProjectInstance } from "@/server/project-instances";
import { getProjectCheckpoints, setCheckpointState } from "@/server/checkpoints";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("named instances (docs/38)", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let projectId: string;
  let marketA: string;
  let templateId: string | null = null;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [p] = await createUsers(rbId, 1, "ninst");
    pm = { tenantId: rbId, userId: p.id, roles: ["ProjectManager"] };
    await withTenant(pm, async (tx) => {
      marketA = (await tx.orgUnit.findFirstOrThrow({ where: { kind: "Market" }, select: { id: true }, orderBy: { code: "asc" } })).id;
      templateId = (await tx.checkpointTemplate.findFirst({ select: { id: true } }))?.id ?? null;
      projectId = (
        await tx.project.create({ data: { tenantId: rbId, code: "NINST", name: "Named instances fixture", type: "Project", priority: "Med", status: "Planning", leadUserId: p.id, checkpointTemplateId: templateId }, select: { id: true } })
      ).id;
    });
    await addMarkets(pm, projectId, { orgUnitIds: [marketA] });
  });

  afterAll(async () => {
    await withTenant(pm, async (tx) => {
      await tx.auditLog.deleteMany({ where: { actorId: pm.userId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("derives a code from the name and keeps codes unique per project", async () => {
    expect(instanceCode("For Schools")).toBe("SCHOOLS");
    expect(instanceCode("Agent Portal")).toBe("AGENPORT");
    const rows = await createProjectInstance(pm, projectId, { name: "For Schools" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "SCHOOLS", name: "For Schools" });
    // Product level + one market → two cells, all Planned at 0%.
    expect(rows[0]!.cells.map((c) => c.orgUnitId)).toEqual([null, marketA]);
    const again = await createProjectInstance(pm, projectId, { name: "Schools" });
    expect(again.map((r) => r.code).sort()).toEqual(["SCHOOLS", "SCHOOLS2"]);
    await expect(createProjectInstance(pm, projectId, { name: "x", code: "SCHOOLS" })).rejects.toMatchObject({ code: "CODE_TAKEN" } satisfies Partial<ProjectInstanceError>);
  });

  it("an instance has its own gates per market, and a state per market", async () => {
    if (!templateId) return;
    const [inst] = await listProjectInstances(pm, projectId);
    const first = (await getProjectCheckpoints(pm, projectId)).rows[0]!.checkpointId;
    // InProgress, not Done: closing a gate runs its checklist (approved BRD, a lead), which is not what this test is about.
    await setCheckpointState(pm, projectId, { checkpointId: first, state: "InProgress" }, { moduleId: inst!.id, orgUnitId: marketA });
    const after = await listProjectInstances(pm, projectId);
    const cellA = after[0]!.cells.find((c) => c.orgUnitId === marketA)!;
    const cellProduct = after[0]!.cells.find((c) => c.orgUnitId === null)!;
    expect(cellA.progress).toBeGreaterThan(0);
    expect(cellProduct.progress).toBe(0);
    // The product's own track and the market's own track are untouched.
    expect((await getProjectCheckpoints(pm, projectId)).rows[0]!.state).toBe("NotStarted");
    expect((await getProjectCheckpoints(pm, projectId, { orgUnitId: marketA })).rows[0]!.state).toBe("NotStarted");
    const withState = await setInstanceState(pm, projectId, inst!.id, { orgUnitId: marketA, state: "UAT", note: "Pilot schools" });
    expect(withState[0]!.cells.find((c) => c.orgUnitId === marketA)).toMatchObject({ state: "UAT", note: "Pilot schools" });
    await expect(setInstanceState(pm, projectId, inst!.id, { orgUnitId: "00000000-0000-4000-8000-000000000000", state: "Live" })).rejects.toMatchObject({ code: "BAD_MARKET" });
    const renamed = await updateProjectInstance(pm, projectId, inst!.id, { name: "For Schools (pilot)" });
    expect(renamed[0]!.name).toBe("For Schools (pilot)");
  });

  it("a module is state-only until its own gates are switched on; it can sit under an instance", async () => {
    const [inst] = await listProjectInstances(pm, projectId);
    const mods = await createProjectInstance(pm, projectId, { name: "USSD", kind: "module" });
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ kind: "module", ownGates: false, parentId: null, code: "USSD" });
    expect(await listProjectInstances(pm, projectId)).toHaveLength(2); // instances unaffected
    const ussd = mods[0]!;
    const st = await setInstanceState(pm, projectId, ussd.id, { orgUnitId: marketA, state: "Live" });
    expect(st.find((m) => m.id === ussd.id)!.cells.find((c) => c.orgUnitId === marketA)!.state).toBe("Live");
    if (templateId) {
      const first = (await getProjectCheckpoints(pm, projectId)).rows[0]!.checkpointId;
      await expect(setCheckpointState(pm, projectId, { checkpointId: first, state: "InProgress" }, { moduleId: ussd.id, orgUnitId: marketA })).rejects.toMatchObject({ code: "TEMPLATE_MISMATCH" });
      await updateProjectInstance(pm, projectId, ussd.id, { ownGates: true, parentId: inst!.id });
      await setCheckpointState(pm, projectId, { checkpointId: first, state: "InProgress" }, { moduleId: ussd.id, orgUnitId: marketA });
      const after = (await listProjectInstances(pm, projectId, "module")).find((m) => m.id === ussd.id)!;
      expect(after).toMatchObject({ ownGates: true, parentId: inst!.id });
      expect(after.cells.find((c) => c.orgUnitId === marketA)!.progress).toBeGreaterThan(0);
    }
    await expect(createProjectInstance(pm, projectId, { name: "Bad", kind: "module", parentId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("removes only an empty instance; the other tenant sees nothing", async () => {
    const rows = await listProjectInstances(pm, projectId);
    const withGates = rows.find((r) => r.code === "SCHOOLS")!;
    // The instance now also carries a module → still HAS_WORK; the module itself (with gate rows) too.
    const empty = rows.find((r) => r.code === "SCHOOLS2")!;
    if (templateId) await expect(removeProjectInstance(pm, projectId, withGates.id)).rejects.toMatchObject({ code: "HAS_WORK" });
    expect((await removeProjectInstance(pm, projectId, empty.id)).map((r) => r.code)).toEqual(["SCHOOLS"]);
    const other: TenantContext = { tenantId: dbId, userId: "seed", roles: ["PlatformSuperAdmin"] };
    await expect(listProjectInstances(other, projectId)).resolves.toEqual([]);
    await expect(createProjectInstance(other, projectId, { name: "Nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// M-P2c (docs/33) — cross-project dependencies: cycle refusal (direct + transitive +
// self), delivery-owner gate, audit + other-PM notification, both-direction listing,
// the blocking map's liveness rule, and RLS isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import {
  addProjectDependency,
  blockingMap,
  listProjectDependencies,
  removeProjectDependency,
  wouldCycleProjects,
} from "@/server/project-dependencies";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("wouldCycleProjects (pure)", () => {
  const edges = [
    { projectId: "a", dependsOnProjectId: "b" },
    { projectId: "b", dependsOnProjectId: "c" },
  ];
  it("refuses self, direct and transitive loops; allows a clean edge", () => {
    expect(wouldCycleProjects(edges, "a", "a")).toBe(true); // self
    expect(wouldCycleProjects(edges, "b", "a")).toBe(true); // direct: a→b exists
    expect(wouldCycleProjects(edges, "c", "a")).toBe(true); // transitive: a→b→c
    expect(wouldCycleProjects(edges, "a", "c")).toBe(false); // forward shortcut is fine
  });
});

describe("M-P2c project dependencies", () => {
  let rbId: string;
  let dbId: string;
  let headCtx: TenantContext;
  let pmId: string;
  let otherPmId: string;
  let a: string;
  let b: string;
  let c: string;

  const mk = async (code: string, lead: string | null, status = "OnTrack") =>
    (
      await withTenant(headCtx, (tx) =>
        tx.project.create({
          data: { tenantId: rbId, code, name: `dep ${code}`, type: "Project", priority: "Med", status, leadUserId: lead },
          select: { id: true },
        }),
      )
    ).id;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [pm, otherPm] = await createUsers(rbId, 2, "dep");
    pmId = pm.id;
    otherPmId = otherPm.id;
    headCtx = { tenantId: rbId, userId: pmId, roles: ["HeadOfProjects"] };
    a = await mk("DEPA", pmId);
    b = await mk("DEPB", otherPmId, "AtRisk");
    c = await mk("DEPC", null, "Completed");
  });

  afterAll(async () => {
    await withTenant(headCtx, async (tx) => {
      await tx.projectDependency.deleteMany({ where: { projectId: { in: [a, b, c] } } });
      await tx.project.deleteMany({ where: { code: { in: ["DEPA", "DEPB", "DEPC"] } } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("a member without delivery ownership cannot declare; the Head can — audited + other PM notified", async () => {
    const outsider: TenantContext = { tenantId: rbId, userId: otherPmId, roles: ["Member"] };
    await expect(addProjectDependency(outsider, a, b)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const dep = await addProjectDependency(headCtx, a, b, "UAT waits on their API");
    expect(dep.note).toBe("UAT waits on their API");

    const auditRow = await withTenant(headCtx, (tx) =>
      tx.auditLog.findFirst({ where: { entityType: "project_dependency", entityId: dep.id } }),
    );
    expect(auditRow).not.toBeNull();
    // DEPB's PM (the other side) hears their delivery now gates someone else's.
    const note = await withTenant(headCtx, (tx) =>
      tx.notification.findFirst({ where: { userId: otherPmId, kind: "project_dependency.created" } }),
    );
    expect(note?.message).toContain("DEPA");
  });

  it("duplicates, self-loops and cycles are refused with named codes", async () => {
    await expect(addProjectDependency(headCtx, a, b)).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(addProjectDependency(headCtx, a, a)).rejects.toMatchObject({ code: "DEPENDENCY_CYCLE" });
    // a→b exists; b→a would close the loop.
    await expect(addProjectDependency(headCtx, b, a)).rejects.toMatchObject({ code: "DEPENDENCY_CYCLE" });
    // transitive: b→c then c→a while a→b exists.
    await addProjectDependency(headCtx, b, c);
    await expect(addProjectDependency(headCtx, c, a)).rejects.toMatchObject({ code: "DEPENDENCY_CYCLE" });
  });

  it("lists both directions with health, and the blocking map keeps only LIVE upstreams", async () => {
    const forA = await listProjectDependencies(headCtx, a);
    expect(forA.waitsOn.map((r) => r.code)).toEqual(["DEPB"]);
    expect(forA.waitsOn[0].rag).toBe("Amber"); // AtRisk → Amber via the shared engine
    const forB = await listProjectDependencies(headCtx, b);
    expect(forB.blocks.map((r) => r.code)).toEqual(["DEPA"]);
    expect(forB.waitsOn.map((r) => r.code)).toEqual(["DEPC"]);

    const map = await blockingMap(headCtx);
    const edges = map.flatMap((g) => g.edges);
    // a→b is live (DEPB AtRisk); b→c is NOT (DEPC Completed — delivered upstreams drop).
    expect(edges.some((e) => e.projectCode === "DEPA" && e.waitsOnCode === "DEPB")).toBe(true);
    expect(edges.some((e) => e.waitsOnCode === "DEPC")).toBe(false);
  });

  it("remove is owner-gated and audited; tenant B sees nothing throughout", async () => {
    const dbCtx: TenantContext = { tenantId: dbId, userId: "test", roles: ["HeadOfProjects"] };
    const foreign = await withTenant(dbCtx, (tx) => tx.projectDependency.findFirst({ where: { projectId: a } }));
    expect(foreign).toBeNull();

    await removeProjectDependency(headCtx, a, b);
    const after = await listProjectDependencies(headCtx, a);
    expect(after.waitsOn).toEqual([]);
    await expect(removeProjectDependency(headCtx, a, b)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

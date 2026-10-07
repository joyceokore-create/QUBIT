// First-week walkthrough — who is offered it and the one flag that stops it: a PM with a
// project gets it (with that project to walk), finishing stamps and audits, an executive
// never sees it, a plain member neither, and the other tenant's projects don't count.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { completeTour, resetTour, shouldOfferTour } from "@/server/tour";
import { getProjectSetup } from "@/server/project-setup";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("first-week walkthrough", () => {
  let rbId: string;
  let dbId: string;
  let pm: TenantContext;
  let exec: TenantContext;
  let member: TenantContext;
  let projectId: string;
  let foreignId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([prisma.tenant.findUnique({ where: { slug: "riverbank" } }), prisma.tenant.findUnique({ where: { slug: "demo-b" } })]);
    if (!rb || !db) throw new Error("Seed required.");
    rbId = rb.id;
    dbId = db.id;
    const [p, e, m] = await createUsers(rbId, 3, "tour");
    pm = { tenantId: rbId, userId: p.id, roles: ["Member"] }; // runs a project, holds no PM role → still eligible
    exec = { tenantId: rbId, userId: e.id, roles: ["Executive"] };
    member = { tenantId: rbId, userId: m.id, roles: ["Member"] };
    projectId = (
      await withTenant(pm, (tx) => tx.project.create({ data: { tenantId: rbId, code: "TOUR-A", name: "Tour fixture", type: "Project", priority: "Med", status: "Planning", leadUserId: p.id }, select: { id: true } }))
    ).id;
    foreignId = (
      await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.create({ data: { tenantId: dbId, code: "TOUR-X", name: "Foreign", type: "Project", priority: "Med", status: "Planning", leadUserId: p.id }, select: { id: true } }))
    ).id;
  });

  afterAll(async () => {
    await withTenant(pm, async (tx) => {
      await tx.auditLog.deleteMany({ where: { actorId: pm.userId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await withTenant({ tenantId: dbId, userId: "seed" }, (tx) => tx.project.deleteMany({ where: { id: foreignId } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("offers the walk once to someone who runs a project, with that project; stamps on completion", async () => {
    expect(await shouldOfferTour(pm)).toEqual({ offer: true, eligible: true, firstProjectId: projectId, projectCount: 1, reportsQuery: "" });
    await completeTour(pm);
    expect(await shouldOfferTour(pm)).toMatchObject({ offer: false, eligible: true, firstProjectId: projectId });
    const audits = await withTenant(pm, (tx) => tx.auditLog.count({ where: { entityType: "user", entityId: pm.userId, actorId: pm.userId } }));
    expect(audits).toBe(1);
    await resetTour(pm);
    expect((await shouldOfferTour(pm)).offer).toBe(true);
  });

  it("never interrupts an executive, a plain member, or a super admin (who may still replay)", async () => {
    expect(await shouldOfferTour(exec)).toMatchObject({ offer: false, eligible: false, projectCount: 0 });
    expect(await shouldOfferTour(member)).toMatchObject({ offer: false, eligible: false });
    const admin: TenantContext = { tenantId: rbId, userId: pm.userId, roles: ["PlatformSuperAdmin"] };
    expect(await shouldOfferTour(admin)).toMatchObject({ offer: false, eligible: true, firstProjectId: projectId, reportsQuery: "?as=pm" });
    // A super admin who runs nothing can still replay — on some active project.
    const adminNoProjects: TenantContext = { tenantId: rbId, userId: member.userId, roles: ["PlatformSuperAdmin"] };
    const r = await shouldOfferTour(adminNoProjects);
    expect(r).toMatchObject({ offer: false, eligible: true, projectCount: 0 });
    expect(r.firstProjectId).toBeTruthy();
  });

  it("per-project setup counts only what exists, and YouTrack only while the flag is on", async () => {
    const setup = await getProjectSetup(pm, projectId);
    expect(setup).toMatchObject({ gates: false, documents: false, team: false, thisWeek: false, done: 0 });
    expect(setup.total).toBe(setup.youtrack === null ? 4 : 5);
  });
});

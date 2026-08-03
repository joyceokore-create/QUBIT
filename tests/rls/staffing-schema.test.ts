// M-P1a (docs/27 §2) — schema + keys for the create & assign track: category axis on
// portfolio/programme, assignment windows, and RLS isolation for the two new staffing
// tables. Runs against the real database (migrations + seed applied).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { canRaiseResourceRequest } from "@/lib/access";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M-P1a create & assign schema", () => {
  let rbId: string;
  let dbId: string;
  let rbCtx: TenantContext;
  let dbCtx: TenantContext;
  let rbProjectId: string;
  let raiserId: string;
  let outsiderId: string;

  beforeAll(async () => {
    const [rb, db] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
      prisma.tenant.findUnique({ where: { slug: "demo-b" } }),
    ]);
    if (!rb || !db) throw new Error("Seed required — run `pnpm prisma:seed`.");
    rbId = rb.id;
    dbId = db.id;
    rbCtx = { tenantId: rbId, userId: "test", roles: ["Member"] };
    dbCtx = { tenantId: dbId, userId: "test", roles: ["Member"] };
    rbProjectId = (
      await withTenant(rbCtx, (tx) => tx.project.findFirstOrThrow({ select: { id: true } }))
    ).id;
    const [raiser, outsider] = await createUsers(rbId, 2, "staff");
    raiserId = raiser.id;
    outsiderId = outsider.id;
  });

  afterAll(async () => {
    await withTenant(rbCtx, (tx) => tx.resourceRequest.deleteMany({ where: { note: "fixture" } }));
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("portfolio/programme categories: existing rows backfilled Approved, new rows default Exploring", async () => {
    const existing = await withTenant(rbCtx, (tx) => tx.portfolio.findMany({ select: { category: true } }));
    expect(existing.length).toBeGreaterThan(0);
    // The migration ran its backfill inside the tenant loop (DM1.50) — if this reads
    // "Exploring" the loop silently no-oped again.
    expect(existing.every((p) => p.category === "Approved")).toBe(true);

    const fresh = await withTenant(rbCtx, (tx) =>
      tx.portfolio.create({ data: { tenantId: rbId, name: "mp1a-fixture" }, select: { id: true, category: true } }),
    );
    expect(fresh.category).toBe("Exploring");
    await withTenant(rbCtx, (tx) => tx.portfolio.delete({ where: { id: fresh.id } }));
  });

  it("a ProjectMember can carry an assignment window; old rows stay open-ended", async () => {
    const m = await withTenant(rbCtx, (tx) =>
      tx.projectMember.create({
        data: {
          tenantId: rbId,
          projectId: rbProjectId,
          userId: raiserId,
          role: "Developer",
          allocationPct: 60,
          startDate: new Date("2026-08-18"),
          endDate: new Date("2026-11-30"),
        },
        select: { id: true, startDate: true, endDate: true },
      }),
    );
    expect(m.startDate).not.toBeNull();
    const legacy = await withTenant(rbCtx, (tx) =>
      tx.projectMember.findFirst({ where: { startDate: null, endDate: null }, select: { id: true } }),
    );
    expect(legacy).not.toBeNull(); // pre-P1 rows were not backfilled with invented dates
    await withTenant(rbCtx, (tx) => tx.projectMember.delete({ where: { id: m.id } }));
  });

  describe("RLS isolation on the new tables", () => {
    let requestId: string;

    beforeAll(async () => {
      requestId = (
        await withTenant(rbCtx, (tx) =>
          tx.resourceRequest.create({
            data: {
              tenantId: rbId,
              projectId: rbProjectId,
              raisedById: raiserId,
              role: "QA Engineer",
              allocationPct: 60,
              windowStart: new Date("2026-08-10"),
              windowEnd: new Date("2026-09-30"),
              note: "fixture",
            },
            select: { id: true },
          })
        )
      ).id;
    });

    it("tenant B cannot read tenant A's resource requests or team templates", async () => {
      const [reqB, tplB] = await withTenant(dbCtx, async (tx) => [
        await tx.resourceRequest.findUnique({ where: { id: requestId } }),
        await tx.teamTemplate.findFirst({ where: { tenantId: rbId } }),
      ]);
      expect(reqB).toBeNull();
      expect(tplB).toBeNull();
    });

    it("tenant B cannot write into tenant A's rows", async () => {
      const { count } = await withTenant(dbCtx, (tx) =>
        tx.resourceRequest.updateMany({ where: { id: requestId }, data: { status: "Declined" } }),
      );
      expect(count).toBe(0);
      const still = await withTenant(rbCtx, (tx) =>
        tx.resourceRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } }),
      );
      expect(still.status).toBe("Open");
    });

    it("the seeded Standard build template is present with the six-hat shape", async () => {
      const tpl = await withTenant(rbCtx, (tx) =>
        tx.teamTemplate.findUniqueOrThrow({
          where: { tenantId_name: { tenantId: rbId, name: "Standard build" } },
          select: { shape: true },
        }),
      );
      const shape = tpl.shape as { role: string; allocationPct: number }[];
      expect(shape).toHaveLength(6);
      expect(shape.filter((s) => s.role === "Developer")).toHaveLength(2);
      expect(shape.every((s) => s.allocationPct > 0 && s.allocationPct <= 100)).toBe(true);
    });
  });

  describe("keys (docs/27 §1.4)", () => {
    const ctxWith = (roles: string[]): TenantContext => ({ tenantId: rbId, userId: "test", roles });

    it("portfolio:create — Executive and HeadOfProjects yes; PM and Member no", () => {
      expect(can(ctxWith(["Executive"]), "portfolio:create")).toBe(true);
      expect(can(ctxWith(["HeadOfProjects"]), "portfolio:create")).toBe(true);
      expect(can(ctxWith(["ProjectManager"]), "portfolio:create")).toBe(false);
      expect(can(ctxWith(["Member"]), "portfolio:create")).toBe(false);
    });

    it("staffing:manage — HeadOfProjects only (plus SuperAdmin via *)", () => {
      expect(can(ctxWith(["HeadOfProjects"]), "staffing:manage")).toBe(true);
      expect(can(ctxWith(["PlatformSuperAdmin"]), "staffing:manage")).toBe(true);
      for (const r of ["Executive", "ProjectManager", "HeadOfQA", "Member"]) {
        expect(can(ctxWith([r]), "staffing:manage"), r).toBe(false);
      }
    });

    it("canRaiseResourceRequest: the project's PM-role member yes, an unrelated member no", async () => {
      const pmMember = await withTenant(rbCtx, (tx) =>
        tx.projectMember.create({
          data: { tenantId: rbId, projectId: rbProjectId, userId: raiserId, role: "Project Manager" },
          select: { id: true },
        }),
      );
      expect(
        await canRaiseResourceRequest({ tenantId: rbId, userId: raiserId, roles: ["Member"] }, rbProjectId),
      ).toBe(true);
      expect(
        await canRaiseResourceRequest({ tenantId: rbId, userId: outsiderId, roles: ["Member"] }, rbProjectId),
      ).toBe(false);
      await withTenant(rbCtx, (tx) => tx.projectMember.delete({ where: { id: pmMember.id } }));
    });
  });
});

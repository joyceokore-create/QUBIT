// Milestone 5 project create/update lifecycle: audit trail correctness and tenant
// isolation. Requires a migrated, seeded DB (`pnpm prisma:migrate && pnpm prisma:seed`).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject, updateProject, ProjectError } from "@/server/projects";

const TEST_CODE = "TEST-LIFECYCLE-01";

describe("Project create/update lifecycle", () => {
  let kcbId: string;
  let riverbankId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) {
      throw new Error("Project tests require seeded data — run `pnpm prisma:seed` first.");
    }
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    ctx = { tenantId: kcbId, userId: "test-project-actor", roles: ["PlatformSuperAdmin"] };
  });

  beforeEach(async () => {
    await withTenant(ctx, async (tx) => {
      const existing = await tx.project.findUnique({
        where: { tenantId_code: { tenantId: kcbId, code: TEST_CODE } },
      });
      if (existing) {
        await tx.auditLog.deleteMany({ where: { entityId: existing.id } });
        await tx.project.delete({ where: { id: existing.id } });
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a project and writes a create audit row", async () => {
    const project = await createProject(ctx, {
      code: TEST_CODE,
      name: "Test Lifecycle Project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });

    expect(project.tenantId).toBe(kcbId);

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: project.id } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("create");
    expect(rows[0].after).toMatchObject({ code: TEST_CODE, status: "Planning" });
  });

  it("rejects creating a project with a duplicate code in the same tenant", async () => {
    await createProject(ctx, {
      code: TEST_CODE,
      name: "Test Lifecycle Project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });

    await expect(
      createProject(ctx, {
        code: TEST_CODE,
        name: "Duplicate",
        type: "Project",
        priority: "Low",
        status: "Planning",
      }),
    ).rejects.toThrow(ProjectError);
  });

  it("allows the same project code in a different tenant (per-tenant uniqueness)", async () => {
    const kcbProject = await createProject(ctx, {
      code: TEST_CODE,
      name: "Test Lifecycle Project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });

    const riverbankCtx: TenantContext = {
      tenantId: riverbankId,
      userId: "test-project-actor",
      roles: ["PlatformSuperAdmin"],
    };
    const rbProject = await createProject(riverbankCtx, {
      code: TEST_CODE,
      name: "Test Lifecycle Project (Riverbank)",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });

    expect(rbProject.id).not.toBe(kcbProject.id);

    await withTenant(riverbankCtx, (tx) =>
      tx.auditLog.deleteMany({ where: { entityId: rbProject.id } }),
    );
    await withTenant(riverbankCtx, (tx) => tx.project.delete({ where: { id: rbProject.id } }));
  });

  it("updates a project and writes a before/after update audit row", async () => {
    const project = await createProject(ctx, {
      code: TEST_CODE,
      name: "Test Lifecycle Project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });

    const updated = await updateProject(ctx, project.id, {
      status: "OnTrack",
      priority: "High",
      budget: "KES 10M",
    });
    expect(updated.status).toBe("OnTrack");
    expect(updated.priority).toBe("High");
    expect(updated.budget).toBe("KES 10M");

    const rows = await withTenant(ctx, (tx) =>
      tx.auditLog.findMany({ where: { entityId: project.id, action: "update" } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toMatchObject({ status: "Planning", priority: "Med" });
    expect(rows[0].after).toMatchObject({ status: "OnTrack", priority: "High", budget: "KES 10M" });
  });

  it("cannot update a project belonging to another tenant", async () => {
    const project = await createProject(ctx, {
      code: TEST_CODE,
      name: "Test Lifecycle Project",
      type: "Project",
      priority: "Med",
      status: "Planning",
    });

    const riverbankCtx: TenantContext = {
      tenantId: riverbankId,
      userId: "test-project-actor",
      roles: ["PlatformSuperAdmin"],
    };
    await expect(updateProject(riverbankCtx, project.id, { status: "OnTrack" })).rejects.toThrow();
  });
});

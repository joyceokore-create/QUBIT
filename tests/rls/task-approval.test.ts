// Plan-approval workflow (§2.2) — Draft tasks excluded from progress until approved. Needs a seeded DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { addTasks, getProjectProgress, publishProjectDrafts } from "@/server/project-tasks";

describe("plan approval — Draft tasks (§2.2)", () => {
  let tenantId: string;
  let projectId: string;
  let ctx: TenantContext;

  beforeAll(async () => {
    const kcb = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!kcb) throw new Error("task-approval tests require seeded data — run `pnpm prisma:seed` first.");
    tenantId = kcb.id;
    ctx = { tenantId, userId: "approval-actor", roles: ["ProjectManager"] };
    await withTenant(ctx, async (tx) => {
      const p = await tx.project.create({
        data: { tenantId, code: "APPROVAL-TEST-01", name: "Approval Test", type: "Project", priority: "Medium", status: "OnTrack" },
      });
      projectId = p.id;
    });
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.projectTask.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await prisma.$disconnect();
  });

  it("excludes Draft tasks from progress until they're approved", async () => {
    await addTasks(ctx, projectId, [{ title: "Manual published task" }]); // Published (default)
    await addTasks(ctx, projectId, [{ title: "AI task 1" }, { title: "AI task 2" }], { approvalStatus: "Draft" });

    let progress = await getProjectProgress(ctx, projectId);
    expect(progress.total).toBe(1); // only the Published task counts

    const { published } = await publishProjectDrafts(ctx, projectId);
    expect(published).toBe(2);

    progress = await getProjectProgress(ctx, projectId);
    expect(progress.total).toBe(3); // drafts are now published and counted
  });
});

// Milestone A — the workspace's "Register (N)" badge counts what is still OPEN on the
// project: blockers (Open), risks (not Closed), issues (not Resolved/Closed). Closed and
// resolved items are history, not work.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { registerOpenCount } from "@/server/project-register";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("Milestone A — register open count", () => {
  let rbId: string;
  let ctx: TenantContext;
  let projectId: string;

  beforeAll(async () => {
    const rb = await prisma.tenant.findUnique({ where: { slug: "riverbank" } });
    if (!rb) throw new Error("Seed required.");
    rbId = rb.id;
    const [pm] = await createUsers(rbId, 1, "prg");
    ctx = { tenantId: rbId, userId: pm.id, roles: ["ProjectManager"] };
    await withTenant(ctx, async (tx) => {
      projectId = (
        await tx.project.create({
          data: { tenantId: rbId, code: "PRG1", name: "register fixture", type: "Project", priority: "Med", status: "OnTrack", leadUserId: pm.id },
          select: { id: true },
        })
      ).id;
      await tx.blocker.createMany({
        data: [
          { tenantId: rbId, projectId, description: "open blocker", status: "Open" },
          { tenantId: rbId, projectId, description: "resolved blocker", status: "Resolved" },
        ],
      });
      await tx.risk.createMany({
        data: [
          { tenantId: rbId, projectId, title: "open risk", probability: 2, impact: 2, status: "Open" },
          { tenantId: rbId, projectId, title: "closed risk", probability: 1, impact: 1, status: "Closed" },
        ],
      });
      await tx.issue.createMany({
        data: [
          { tenantId: rbId, projectId, title: "open issue", severity: "Low", status: "Open" },
          { tenantId: rbId, projectId, title: "resolved issue", severity: "Low", status: "Resolved" },
          { tenantId: rbId, projectId, title: "closed issue", severity: "Low", status: "Closed" },
        ],
      });
    });
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.issue.deleteMany({ where: { projectId } });
      await tx.risk.deleteMany({ where: { projectId } });
      await tx.blocker.deleteMany({ where: { projectId } });
      await tx.project.deleteMany({ where: { id: projectId } });
    });
    await cleanupFixtureUsers(rbId);
    await prisma.$disconnect();
  });

  it("counts one open blocker + one open risk + one open issue = 3", async () => {
    expect(await registerOpenCount(ctx, projectId)).toBe(3);
  });
});

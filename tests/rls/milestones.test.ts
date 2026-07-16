// PRD Module 8 — milestones: CRUD, overdue derivation, tenant isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject } from "@/server/projects";
import { createMilestone, listMilestones, updateMilestone, deleteMilestone } from "@/server/milestones";

describe("MVP1 — milestones", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let projectId: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const ku = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    const ru = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: ku.id, roles: [] };
    riverbank = { tenantId: r.id, userId: ru.id, roles: [] };
    const p = await createProject(kcb, { code: `MS-${Date.now().toString().slice(-6)}`, name: "Milestone test", type: "Project", priority: "Medium", status: "Planning" });
    projectId = p.id;
    projectIds.push(p.id);
  });

  afterAll(async () => {
    await withTenant(kcb, async (tx) => {
      await tx.projectMilestone.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("creates milestones and derives overdue", async () => {
    await createMilestone(kcb, projectId, { name: "Kickoff", dueDate: "2020-01-01T00:00:00.000Z" }); // past
    await createMilestone(kcb, projectId, { name: "Go-live", dueDate: "2999-01-01T00:00:00.000Z" }); // future
    const list = await listMilestones(kcb, projectId);
    expect(list.find((m) => m.name === "Kickoff")?.overdue).toBe(true);
    expect(list.find((m) => m.name === "Go-live")?.overdue).toBe(false);
  });

  it("marking done clears overdue", async () => {
    const past = (await listMilestones(kcb, projectId)).find((m) => m.name === "Kickoff")!;
    await updateMilestone(kcb, past.id, { status: "Done" });
    const after = (await listMilestones(kcb, projectId)).find((m) => m.id === past.id)!;
    expect(after.status).toBe("Done");
    expect(after.overdue).toBe(false);
  });

  it("is tenant-isolated and deletable", async () => {
    expect(await listMilestones(riverbank, projectId)).toHaveLength(0);
    const one = (await listMilestones(kcb, projectId))[0];
    await deleteMilestone(kcb, one.id);
    expect((await listMilestones(kcb, projectId)).some((m) => m.id === one.id)).toBe(false);
  });
});

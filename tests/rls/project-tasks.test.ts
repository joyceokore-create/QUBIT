// MVP1 PRD M5–M7 — project tasks: add, auto-progress, status, AI guard, tenant isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createProject } from "@/server/projects";
import {
  addTasks,
  listProjectTasks,
  getProjectProgress,
  setTaskStatus,
  updateTask,
  listMyTasks,
  generatePlan,
  TaskError,
} from "@/server/project-tasks";

describe("MVP1 — project tasks (M5–M7)", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let projectId: string;
  const projectIds: string[] = [];

  beforeAll(async () => {
    delete process.env.ANTHROPIC_API_KEY; // exercise the offline guard
    delete process.env.Q_MOCK_AI; // and the true no-mock path (AI_UNAVAILABLE)
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const kUser = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    const rUser = await withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: kUser.id, roles: [] };
    riverbank = { tenantId: r.id, userId: rUser.id, roles: [] };
    const project = await createProject(kcb, {
      code: `PT-${Date.now().toString().slice(-6)}`,
      name: "Task pipeline test",
      type: "Project",
      priority: "High",
      status: "Planning",
    });
    projectId = project.id;
    projectIds.push(project.id);
  });

  afterAll(async () => {
    await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, async (tx) => {
      await tx.projectTask.deleteMany({ where: { projectId: { in: projectIds } } });
      await tx.project.deleteMany({ where: { id: { in: projectIds } } });
    });
    await prisma.$disconnect();
  });

  it("adds tasks and lists them in order", async () => {
    await addTasks(kcb, projectId, [
      { title: "Discovery workshop", phase: "Discovery", ownerRole: "Business Analyst", priority: "High" },
      { title: "Draft requirements", phase: "Requirements", priority: "Medium" },
      { title: "Build API", phase: "Development", ownerRole: "Developer" },
    ]);
    const tasks = await listProjectTasks(kcb, projectId);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].title).toBe("Discovery workshop");
    expect(tasks[0].ownerRole).toBe("Business Analyst");
  });

  it("computes progress automatically (completed ÷ total)", async () => {
    let progress = await getProjectProgress(kcb, projectId);
    expect(progress).toMatchObject({ total: 3, completed: 0, pct: 0 });

    const tasks = await listProjectTasks(kcb, projectId);
    await setTaskStatus(kcb, tasks[0].id, "Completed");
    await setTaskStatus(kcb, tasks[1].id, "Blocked");

    progress = await getProjectProgress(kcb, projectId);
    expect(progress.completed).toBe(1);
    expect(progress.blocked).toBe(1);
    expect(progress.pct).toBe(33); // 1/3
  });

  it("assigns a task to a user and lists it under My Tasks", async () => {
    const tasks = await listProjectTasks(kcb, projectId);
    await updateTask(kcb, tasks[2].id, { assigneeId: kcb.userId, dueDate: "2026-08-01T00:00:00.000Z" });
    const mine = await listMyTasks(kcb, kcb.userId);
    const assigned = mine.find((t) => t.id === tasks[2].id);
    expect(assigned).toBeTruthy();
    expect(assigned?.projectCode).toBeTruthy();
    expect(assigned?.dueDate).not.toBeNull();
    // Isolation: Riverbank sees none of KCB's assigned tasks.
    expect(await listMyTasks(riverbank, kcb.userId)).toHaveLength(0);
  });

  it("refuses AI generation without an API key (manual add still works)", async () => {
    await expect(
      generatePlan(kcb, projectId, { text: "Build a mobile app", tenantName: "KCB" }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("keeps tasks tenant-isolated (RLS)", async () => {
    const seen = await listProjectTasks(riverbank, projectId);
    expect(seen).toHaveLength(0); // Riverbank cannot see KCB's project tasks
  });

  it("errors cleanly on empty add", async () => {
    await expect(addTasks(kcb, projectId, [])).rejects.toBeInstanceOf(TaskError);
  });
});

// M7-A task dependencies (docs/16 §12) against the real database: the refusals that need a
// project to be meaningful (cross-project, cycles), what "waiting" means once a blocker is
// done, the audit trail, and tenant isolation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { DependencyError, addDependency, listWaitingOn, removeDependency, waitingCountByTask } from "@/server/dependencies";
import { listProjectTasks, setTaskStatus } from "@/server/project-tasks";
import { createUsers, cleanupFixtureUsers } from "./_users";

describe("M7-A task dependencies", () => {
  let kcbId: string;
  let riverbankId: string;
  let leadId: string;
  let projectA: string;
  let projectB: string;
  let ctx: TenantContext;
  const task: Record<string, string> = {};

  const makeProject = async (code: string, name: string) =>
    withTenant(ctx, (tx) =>
      tx.project.create({
        data: {
          tenantId: kcbId, code, name, type: "Project",
          priority: "High", status: "OnTrack", leadUserId: leadId,
        },
        select: { id: true },
      }),
    );

  beforeAll(async () => {
    const [kcb, riverbank] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!kcb || !riverbank) throw new Error("Requires seeded tenants — run `pnpm prisma:seed`.");
    kcbId = kcb.id;
    riverbankId = riverbank.id;
    [{ id: leadId }] = await createUsers(kcbId, 1, "dep");
    ctx = { tenantId: kcbId, userId: leadId, roles: ["Member"] };

    const stamp = Date.now() % 100000;
    projectA = (await makeProject(`DA${stamp}`, "Dependency Fixture A")).id;
    projectB = (await makeProject(`DB${stamp}`, "Dependency Fixture B")).id;

    await withTenant(ctx, async (tx) => {
      for (const [key, projectId] of [["a", projectA], ["b", projectA], ["c", projectA], ["far", projectB]] as const) {
        const t = await tx.projectTask.create({
          // Chore, so the completion below goes through the real engine without tripping
          // the separate "QA owns Completed for Feature/Bug" rule (docs/18 §4).
          data: { tenantId: kcbId, projectId, title: `Task ${key}`, type: "Chore" },
          select: { id: true },
        });
        task[key] = t.id;
      }
    });
  });

  afterAll(async () => {
    await withTenant(ctx, async (tx) => {
      await tx.projectTaskDependency.deleteMany({ where: { task: { projectId: { in: [projectA, projectB] } } } });
      await tx.projectTask.deleteMany({ where: { projectId: { in: [projectA, projectB] } } });
      await tx.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
    });
    await cleanupFixtureUsers(kcbId);
    await prisma.$disconnect();
  });

  it("declares a wait and reports what it is waiting on", async () => {
    const waiting = await addDependency(ctx, task.a, task.b);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ taskId: task.b, title: "Task b", blocking: true });
  });

  it("is idempotent — declaring the same wait twice leaves one edge", async () => {
    const waiting = await addDependency(ctx, task.a, task.b);
    expect(waiting).toHaveLength(1);
  });

  it("audits the declaration", async () => {
    const entry = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({
        where: { entityType: "project_task", entityId: task.a, action: "update" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(entry?.after).toMatchObject({ dependsOn: task.b });
  });

  it("refuses a task waiting on itself", async () => {
    await expect(addDependency(ctx, task.a, task.a)).rejects.toThrow(DependencyError);
  });

  it("refuses a cross-project dependency — that is a programme question", async () => {
    await expect(addDependency(ctx, task.a, task.far)).rejects.toThrow(/same project/);
  });

  it("refuses a direct cycle with a CYCLE code the API can answer 409 to", async () => {
    // a already waits on b, so b cannot wait on a.
    await expect(addDependency(ctx, task.b, task.a)).rejects.toMatchObject({ code: "CYCLE" });
  });

  it("refuses a transitive cycle", async () => {
    await addDependency(ctx, task.b, task.c); // a → b → c
    await expect(addDependency(ctx, task.c, task.a)).rejects.toMatchObject({ code: "CYCLE" });
  });

  it("refuses a dependency on a task that does not exist", async () => {
    await expect(addDependency(ctx, task.a, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("stops counting a wait once the blocker is Completed", async () => {
    let counts = await waitingCountByTask(ctx, projectA);
    expect(counts.get(task.a)).toBe(1);
    expect(counts.get(task.b)).toBe(1);

    await setTaskStatus(ctx, task.c, "Completed");
    counts = await waitingCountByTask(ctx, projectA);
    expect(counts.get(task.b)).toBeUndefined(); // b's only blocker is done
    expect(counts.get(task.a)).toBe(1); // a still waits on b

    // The edge is still recorded — the history is not rewritten, only the "blocking" flag.
    const waiting = await listWaitingOn(ctx, task.b);
    expect(waiting).toHaveLength(1);
    expect(waiting[0].blocking).toBe(false);
  });

  it("surfaces the wait on the board row", async () => {
    const rows = await listProjectTasks(ctx, projectA);
    const a = rows.find((r) => r.id === task.a)!;
    const b = rows.find((r) => r.id === task.b)!;
    expect(a.waitingOn).toEqual(["Task b"]);
    expect(b.waitingOn).toEqual([]); // completed blocker drops off
  });

  it("removes a wait and audits the removal", async () => {
    const waiting = await removeDependency(ctx, task.a, task.b);
    expect(waiting).toEqual([]);
    const entry = await withTenant(ctx, (tx) =>
      tx.auditLog.findFirst({
        where: { entityType: "project_task", entityId: task.a, action: "update" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(entry?.before).toMatchObject({ dependsOn: task.b });
  });

  it("RLS: dependency edges are invisible from the other tenant", async () => {
    await addDependency(ctx, task.a, task.b);
    const seen = await withTenant({ tenantId: riverbankId, userId: "test" }, (tx) =>
      tx.projectTaskDependency.count({ where: { taskId: task.a } }),
    );
    expect(seen).toBe(0);
  });
});

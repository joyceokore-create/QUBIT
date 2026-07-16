// Phase 5 — automation engine: trigger→action, conditions, loop guard, run log.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createList } from "@/server/spaces";
import { createTask, getTask, updateTask } from "@/server/tasks";
import { getListStatuses } from "@/server/statuses";
import { createAutomation, listAutomations, listRuns } from "@/server/automations";

describe("Phase 5 — automations", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let spaceId: string;
  let listId: string;
  let todo: string;
  let inProgress: string;
  let done: string;
  const createdSpaceIds: string[] = [];

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required.");
    const [ku, ru] = await Promise.all([
      withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } })),
      withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } })),
    ]);
    kcb = { tenantId: k.id, userId: ku.id, roles: [] };
    riverbank = { tenantId: r.id, userId: ru.id, roles: [] };
    const space = await createSpace(kcb, { name: "QA Automations", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    spaceId = space.id;
    const list = await createList(kcb, { spaceId, name: "Auto list" });
    listId = list.id;
    const statuses = await getListStatuses(kcb, listId); // To Do / In Progress / Done
    todo = statuses[0].id;
    inProgress = statuses[1].id;
    done = statuses[2].id;
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("runs an action when the trigger matches and logs a SUCCESS run", async () => {
    const auto = await createAutomation(kcb, {
      locationType: "LIST",
      locationId: listId,
      name: "On In Progress → HIGH priority",
      trigger: { type: "task.status_changed", params: { to: [inProgress] } },
      actions: [{ type: "task.set_priority", params: { priority: "HIGH" } }],
    });
    const task = await createTask(kcb, { listId, name: "Auto A", statusId: todo });

    await updateTask(kcb, task.id, { statusId: inProgress });

    const after = await getTask(kcb, task.id);
    expect(after.priority).toBe("HIGH");
    const runs = await listRuns(kcb, auto.id);
    expect(runs.some((r) => r.status === "SUCCESS")).toBe(true);
    const reloaded = (await listAutomations(kcb, "LIST", listId)).find((a) => a.id === auto.id);
    expect(reloaded?.runCount).toBeGreaterThanOrEqual(1);
  });

  it("skips the action when a condition fails", async () => {
    const auto = await createAutomation(kcb, {
      locationType: "LIST",
      locationId: listId,
      name: "On Done + URGENT → comment",
      trigger: { type: "task.status_changed", params: { to: [done] } },
      conditions: [{ field: "priority", op: "eq", value: "URGENT" }],
      actions: [{ type: "task.set_priority", params: { priority: "LOW" } }],
    });
    const task = await createTask(kcb, { listId, name: "Auto B", statusId: todo }); // priority null
    await updateTask(kcb, task.id, { statusId: done });

    const after = await getTask(kcb, task.id);
    expect(after.priority).toBeNull(); // condition failed → action not applied
    expect(await listRuns(kcb, auto.id)).toHaveLength(0);
  });

  it("stops a status ping-pong at the loop guard (depth 3) and logs it", async () => {
    const a1 = await createAutomation(kcb, {
      locationType: "LIST",
      locationId: listId,
      name: "ping",
      trigger: { type: "task.status_changed", params: { to: [inProgress] } },
      actions: [{ type: "task.set_status", params: { statusId: done } }],
    });
    const a2 = await createAutomation(kcb, {
      locationType: "LIST",
      locationId: listId,
      name: "pong",
      trigger: { type: "task.status_changed", params: { to: [done] } },
      actions: [{ type: "task.set_status", params: { statusId: inProgress } }],
    });
    const task = await createTask(kcb, { listId, name: "Ping pong", statusId: todo });

    // Kick off the ping-pong; must terminate (not hang) thanks to the guard.
    await updateTask(kcb, task.id, { statusId: inProgress });

    const runs = [...(await listRuns(kcb, a1.id)), ...(await listRuns(kcb, a2.id))];
    expect(runs.some((r) => r.status === "SKIPPED" && (r.log as { loopGuarded?: boolean }).loopGuarded)).toBe(true);
  });

  it("keeps automations tenant-isolated", async () => {
    await createAutomation(kcb, {
      locationType: "LIST",
      locationId: listId,
      name: "kcb only",
      trigger: { type: "task.created" },
      actions: [{ type: "task.set_priority", params: { priority: "LOW" } }],
    });
    // Riverbank sees nothing at this (kcb) list id under its own tenant scope.
    expect(await listAutomations(riverbank, "LIST", listId)).toHaveLength(0);
  });
});

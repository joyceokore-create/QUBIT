// Phase 1 Increment 1 — hierarchy + task CRUD, seq, reorder, Activity, isolation.
// Requires migrations + rls.sql + seed on the target DB.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createFolder, createList, reorder } from "@/server/spaces";
import { createTask, getTask, listTasks, updateTask } from "@/server/tasks";
import { NotFoundError } from "@/server/errors";

describe("Phase 1 — hierarchy & task CRUD", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  const createdSpaceIds: string[] = [];

  beforeAll(async () => {
    const [k, r] = await Promise.all([
      prisma.tenant.findUnique({ where: { slug: "kcb" } }),
      prisma.tenant.findUnique({ where: { slug: "riverbank" } }),
    ]);
    if (!k || !r) throw new Error("Seed required — run `pnpm prisma:seed`.");
    const [ku, ru] = await Promise.all([
      withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } })),
      withTenant({ tenantId: r.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } })),
    ]);
    kcb = { tenantId: k.id, userId: ku.id, roles: [] };
    riverbank = { tenantId: r.id, userId: ru.id, roles: [] };
  });

  afterAll(async () => {
    // Cascade removes folders/lists/tasks; leave append-only Activity rows.
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("creates space → folder → list → task with a default status and human seq", async () => {
    const space = await createSpace(kcb, { name: "QA Delivery", statusTemplate: "kanban" });
    createdSpaceIds.push(space.id);
    const folder = await createFolder(kcb, { spaceId: space.id, name: "QA Folder" });
    const list = await createList(kcb, { spaceId: space.id, folderId: folder.id, name: "QA List" });

    // A default status group was created with the space, so the list inherits statuses.
    const task = await createTask(kcb, { listId: list.id, name: "First task" });
    expect(task.statusId).toBeTruthy();
    expect(task.seq).toBeGreaterThan(0);

    const tasks = await listTasks(kcb, list.id);
    expect(tasks.map((t) => t.id)).toContain(task.id);
  });

  it("assigns strictly increasing, unique seq per tenant", async () => {
    const space = await createSpace(kcb, { name: "QA Seq", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Seq list" });
    const a = await createTask(kcb, { listId: list.id, name: "A" });
    const b = await createTask(kcb, { listId: list.id, name: "B" });
    // Strictly increasing + unique is the real invariant. Not exactly +1: seq is
    // per-tenant, and parallel test files share this tenant, so other creates may
    // interleave a number between these two.
    expect(b.seq).toBeGreaterThan(a.seq);
  });

  it("records an Activity row on task creation and status change", async () => {
    const space = await createSpace(kcb, { name: "QA Activity", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Act list" });
    const task = await createTask(kcb, { listId: list.id, name: "Track me" });

    const created = await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
      tx.activity.findMany({ where: { objectType: "task", objectId: task.id, verb: "task.created" } }),
    );
    expect(created.length).toBe(1);

    // Move it to a different status → task.status_changed.
    const other = await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
      tx.status.findFirstOrThrow({ where: { id: { not: task.statusId } }, select: { id: true } }),
    );
    await updateTask(kcb, task.id, { statusId: other.id });
    const changed = await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
      tx.activity.findMany({ where: { objectId: task.id, verb: "task.status_changed" } }),
    );
    expect(changed.length).toBe(1);
  });

  it("reorders a space to a midpoint index between two siblings", async () => {
    const a = await createSpace(kcb, { name: "QA Order A" });
    const b = await createSpace(kcb, { name: "QA Order B" });
    const c = await createSpace(kcb, { name: "QA Order C" });
    createdSpaceIds.push(a.id, b.id, c.id);
    // Appended in order → a < b < c. Move c to sit right after a.
    const moved = await reorder(kcb, { objectType: "SPACE", objectId: c.id, afterId: a.id });
    expect(moved.orderIndex).toBeGreaterThan(a.orderIndex);
    expect(moved.orderIndex).toBeLessThan(b.orderIndex);
  });

  it("cannot read another tenant's task (cross-tenant → NotFound/404)", async () => {
    const space = await createSpace(kcb, { name: "QA Isolation", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Iso list" });
    const task = await createTask(kcb, { listId: list.id, name: "Secret" });

    await expect(getTask(riverbank, task.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

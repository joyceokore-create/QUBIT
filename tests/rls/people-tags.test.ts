// Phase 1 Increment 5 — assignees / watchers / tags.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createList } from "@/server/spaces";
import { createTask, getTask, setAssignee, setWatcher, setTag } from "@/server/tasks";
import { createTag, listTagsForSpace } from "@/server/tags";
import { ConflictError } from "@/server/errors";

describe("Phase 1 — assignees, watchers & tags", () => {
  let kcb: TenantContext;
  let userId: string;
  let spaceId: string;
  let taskId: string;
  const createdSpaceIds: string[] = [];

  beforeAll(async () => {
    const k = await prisma.tenant.findUnique({ where: { slug: "kcb" } });
    if (!k) throw new Error("Seed required.");
    const ku = await withTenant({ tenantId: k.id, userId: "seed" }, (tx) => tx.user.findFirstOrThrow({ where: { status: "ACTIVE" } }));
    kcb = { tenantId: k.id, userId: ku.id, roles: [] };
    userId = ku.id;
    const space = await createSpace(kcb, { name: "QA People", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    spaceId = space.id;
    const list = await createList(kcb, { spaceId, name: "People list" });
    taskId = (await createTask(kcb, { listId: list.id, name: "People task" })).id;
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("adds and removes an assignee (idempotent)", async () => {
    await setAssignee(kcb, taskId, userId, true);
    await setAssignee(kcb, taskId, userId, true); // idempotent upsert
    let task = await getTask(kcb, taskId);
    expect(task.assignees.map((a) => a.userId)).toEqual([userId]);
    await setAssignee(kcb, taskId, userId, false);
    task = await getTask(kcb, taskId);
    expect(task.assignees).toHaveLength(0);
  });

  it("adds a watcher", async () => {
    await setWatcher(kcb, taskId, userId, true);
    const task = await getTask(kcb, taskId);
    expect(task.watchers.map((w) => w.userId)).toContain(userId);
  });

  it("creates a space tag, enforces name uniqueness, and tags a task", async () => {
    const tag = await createTag(kcb, spaceId, { name: "urgent", colorToken: "bad" });
    await expect(createTag(kcb, spaceId, { name: "urgent", colorToken: "warn" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await listTagsForSpace(kcb, spaceId)).map((t) => t.name)).toContain("urgent");

    await setTag(kcb, taskId, tag.id, true);
    const task = await getTask(kcb, taskId);
    expect(task.tags.map((t) => t.tagId)).toContain(tag.id);
    await setTag(kcb, taskId, tag.id, false);
    expect((await getTask(kcb, taskId)).tags).toHaveLength(0);
  });
});

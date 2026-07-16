// Phase 1 Increment 3 — subtasks + dependency cycle detection.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createList } from "@/server/spaces";
import {
  createTask,
  createSubtask,
  setParent,
  addDependency,
  removeDependency,
  getTask,
} from "@/server/tasks";
import { ConflictError, NotFoundError, UnprocessableError } from "@/server/errors";

describe("Phase 1 — subtasks & dependency cycles", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let listId: string;
  const createdSpaceIds: string[] = [];

  async function newTask(name: string) {
    return createTask(kcb, { listId, name });
  }

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
    const space = await createSpace(kcb, { name: "QA Deps", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Deps list" });
    listId = list.id;
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("creates a subtask that appears under its parent", async () => {
    const parent = await newTask("Parent");
    const child = await createSubtask(kcb, parent.id, { name: "Child" });
    const loaded = await getTask(kcb, parent.id);
    expect(loaded.children.map((c) => c.id)).toContain(child.id);
  });

  it("rejects nesting a task under its own descendant", async () => {
    const a = await newTask("A");
    const b = await createSubtask(kcb, a.id, { name: "B under A" });
    // Making A a child of B would create a cycle A→B→A.
    await expect(setParent(kcb, a.id, b.id)).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("adds a blocking dependency and rejects the direct reverse (cycle)", async () => {
    const a = await newTask("Dep A");
    const b = await newTask("Dep B");
    await addDependency(kcb, { fromId: a.id, toId: b.id, type: "BLOCKS" }); // A blocks B
    // B blocks A would close A→B→A.
    await expect(
      addDependency(kcb, { fromId: b.id, toId: a.id, type: "BLOCKS" }),
    ).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("rejects a transitive cycle (A→B→C→A)", async () => {
    const a = await newTask("T A");
    const b = await newTask("T B");
    const c = await newTask("T C");
    await addDependency(kcb, { fromId: a.id, toId: b.id, type: "BLOCKS" });
    await addDependency(kcb, { fromId: b.id, toId: c.id, type: "BLOCKS" });
    await expect(
      addDependency(kcb, { fromId: c.id, toId: a.id, type: "BLOCKS" }),
    ).rejects.toBeInstanceOf(UnprocessableError);
  });

  it("rejects self-dependency and duplicates", async () => {
    const a = await newTask("Self");
    await expect(addDependency(kcb, { fromId: a.id, toId: a.id, type: "BLOCKS" })).rejects.toBeInstanceOf(
      UnprocessableError,
    );
    const b = await newTask("Dup target");
    await addDependency(kcb, { fromId: a.id, toId: b.id, type: "BLOCKS" });
    await expect(addDependency(kcb, { fromId: a.id, toId: b.id, type: "BLOCKS" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("allows LINKED edges in both directions (non-directional, no cycle check)", async () => {
    const a = await newTask("L A");
    const b = await newTask("L B");
    await addDependency(kcb, { fromId: a.id, toId: b.id, type: "LINKED" });
    await expect(
      addDependency(kcb, { fromId: b.id, toId: a.id, type: "LINKED" }),
    ).resolves.toBeTruthy();
  });

  it("removes a dependency", async () => {
    const a = await newTask("R A");
    const b = await newTask("R B");
    const dep = await addDependency(kcb, { fromId: a.id, toId: b.id, type: "BLOCKS" });
    await removeDependency(kcb, dep.id);
    const loaded = await getTask(kcb, a.id);
    expect(loaded.dependencies.find((d) => d.id === dep.id)).toBeUndefined();
  });

  it("cannot add a dependency onto another tenant's task", async () => {
    const a = await newTask("X A");
    // A task id that doesn't exist in kcb (belongs to riverbank space) → NotFound.
    const rbSpace = await createSpace(riverbank, { name: "RB Deps", statusTemplate: "simple" });
    const rbList = await createList(riverbank, { spaceId: rbSpace.id, name: "rb" });
    const rbTask = await createTask(riverbank, { listId: rbList.id, name: "rb task" });
    await expect(
      addDependency(kcb, { fromId: a.id, toId: rbTask.id, type: "BLOCKS" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await withTenant({ tenantId: riverbank.tenantId, userId: "seed" }, (tx) =>
      tx.space.deleteMany({ where: { id: rbSpace.id } }),
    );
  });
});

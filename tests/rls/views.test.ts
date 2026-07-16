// Phase 2 Increment 7 — queryTasks compiler + saved views.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { createSpace, createList } from "@/server/spaces";
import { createTask } from "@/server/tasks";
import { getListStatuses } from "@/server/statuses";
import { queryTasks } from "@/server/views/query";
import { createView, listViews, updateView, deleteView } from "@/server/views";
import { NotFoundError } from "@/server/errors";

describe("Phase 2 — views engine", () => {
  let kcb: TenantContext;
  let riverbank: TenantContext;
  let listId: string;
  let statusA: string;
  let statusB: string;
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
    const space = await createSpace(kcb, { name: "QA Views", statusTemplate: "simple" });
    createdSpaceIds.push(space.id);
    const list = await createList(kcb, { spaceId: space.id, name: "Views list" });
    listId = list.id;
    const statuses = await getListStatuses(kcb, listId);
    statusA = statuses[0].id;
    statusB = statuses[1].id;

    // Seed a few tasks with varied status/priority/name.
    await createTask(kcb, { listId, name: "Alpha", statusId: statusA, priority: "HIGH" });
    await createTask(kcb, { listId, name: "Bravo", statusId: statusB, priority: "LOW" });
    await createTask(kcb, { listId, name: "Charlie search-me", statusId: statusA, priority: "URGENT" });
  });

  afterAll(async () => {
    for (const id of createdSpaceIds) {
      await withTenant({ tenantId: kcb.tenantId, userId: "seed" }, (tx) =>
        tx.space.deleteMany({ where: { id } }),
      );
    }
    await prisma.$disconnect();
  });

  it("filters by status", async () => {
    const { tasks } = await queryTasks(kcb, listId, { filters: { statusIds: [statusA] } });
    expect(tasks.length).toBe(2);
    expect(tasks.every((t) => t.statusId === statusA)).toBe(true);
  });

  it("filters by priority and by search", async () => {
    const byPriority = await queryTasks(kcb, listId, { filters: { priorities: ["URGENT"] } });
    expect(byPriority.tasks.map((t) => t.name)).toEqual(["Charlie search-me"]);
    const bySearch = await queryTasks(kcb, listId, { filters: { search: "search-me" } });
    expect(bySearch.tasks).toHaveLength(1);
  });

  it("sorts by name ascending", async () => {
    const { tasks } = await queryTasks(kcb, listId, { sort: { field: "name", dir: "asc" } });
    const names = tasks.map((t) => t.name);
    expect(names).toEqual([...names].sort());
  });

  it("paginates with a keyset cursor", async () => {
    const first = await queryTasks(kcb, listId, { sort: { field: "name", dir: "asc" }, limit: 2 });
    expect(first.tasks).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await queryTasks(kcb, listId, {
      sort: { field: "name", dir: "asc" },
      limit: 2,
      cursor: first.nextCursor!,
    });
    // No overlap between pages.
    const firstIds = new Set(first.tasks.map((t) => t.id));
    expect(second.tasks.every((t) => !firstIds.has(t.id))).toBe(true);
  });

  it("creates, lists, updates and deletes a saved view", async () => {
    const view = await createView(kcb, {
      locationType: "LIST",
      locationId: listId,
      type: "BOARD",
      name: "My board",
      config: { groupBy: "status" },
      isPinned: true,
    });
    let views = await listViews(kcb, "LIST", listId);
    expect(views.map((v) => v.id)).toContain(view.id);

    await updateView(kcb, view.id, { name: "Renamed board" });
    views = await listViews(kcb, "LIST", listId);
    expect(views.find((v) => v.id === view.id)?.name).toBe("Renamed board");

    await deleteView(kcb, view.id);
    views = await listViews(kcb, "LIST", listId);
    expect(views.find((v) => v.id === view.id)).toBeUndefined();
  });

  it("cannot query another tenant's list (cross-tenant → NotFound)", async () => {
    await expect(queryTasks(riverbank, listId, {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

import type { Prisma, Priority } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";

/**
 * queryTasks() — the view compiler (04-module-specs §4, 05-api-spec.md). Turns a
 * filter/sort spec into one RLS-scoped Prisma query with keyset pagination, so every
 * view (List/Board/Table/…) renders from the same source of truth.
 */

export interface TaskFilters {
  statusIds?: string[];
  priorities?: Priority[];
  assigneeIds?: string[];
  tagIds?: string[];
  search?: string;
  due?: "overdue" | "today" | "week" | "none" | "any";
}

export type SortField = "orderIndex" | "dueDate" | "priority" | "name" | "createdAt";
export interface TaskSort {
  field: SortField;
  dir: "asc" | "desc";
}

export interface QueryOpts {
  filters?: TaskFilters;
  sort?: TaskSort;
  cursor?: string; // last id of the previous page
  limit?: number; // max 100
}

const rowSelect = {
  id: true,
  seq: true,
  name: true,
  statusId: true,
  priority: true,
  dueDate: true,
  isMilestone: true,
  orderIndex: true,
  createdAt: true,
  status: { select: { name: true, colorToken: true } },
  assignees: { select: { userId: true, user: { select: { name: true } } } },
  tags: { select: { tagId: true, tag: { select: { name: true, colorToken: true } } } },
} satisfies Prisma.TaskSelect;

export type TaskRow = Prisma.TaskGetPayload<{ select: typeof rowSelect }>;

function dueWhere(due: TaskFilters["due"]): Prisma.TaskWhereInput {
  if (!due || due === "any") return {};
  if (due === "none") return { dueDate: null };
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  if (due === "overdue") return { dueDate: { lt: startOfToday } };
  if (due === "today") return { dueDate: { gte: startOfToday, lt: endOfToday } };
  // week: today through +7 days
  const weekEnd = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { dueDate: { gte: startOfToday, lt: weekEnd } };
}

function buildWhere(listId: string, f: TaskFilters = {}): Prisma.TaskWhereInput {
  return {
    listId,
    deletedAt: null,
    parentId: null, // top-level tasks; subtasks nest under them
    ...(f.statusIds?.length ? { statusId: { in: f.statusIds } } : {}),
    ...(f.priorities?.length ? { priority: { in: f.priorities } } : {}),
    ...(f.assigneeIds?.length ? { assignees: { some: { userId: { in: f.assigneeIds } } } } : {}),
    ...(f.tagIds?.length ? { tags: { some: { tagId: { in: f.tagIds } } } } : {}),
    ...(f.search ? { name: { contains: f.search, mode: "insensitive" } } : {}),
    ...dueWhere(f.due),
  };
}

export interface QueryResult {
  tasks: TaskRow[];
  nextCursor: string | null;
}

export async function queryTasks(
  ctx: TenantContext,
  listId: string,
  opts: QueryOpts = {},
): Promise<QueryResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const sort = opts.sort ?? { field: "orderIndex", dir: "asc" };
  // Stable tiebreaker on id so keyset pagination is deterministic.
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
    { [sort.field]: sort.dir } as Prisma.TaskOrderByWithRelationInput,
    { id: "asc" },
  ];

  return forTenant(ctx, async (tx) => {
    assertFound(await tx.list.findUnique({ where: { id: listId }, select: { id: true } }), "List not found.");
    const rows = await tx.task.findMany({
      where: buildWhere(listId, opts.filters),
      select: rowSelect,
      orderBy,
      take: limit + 1, // fetch one extra to know if there's a next page
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const tasks = hasMore ? rows.slice(0, limit) : rows;
    return { tasks, nextCursor: hasMore ? tasks[tasks.length - 1].id : null };
  });
}

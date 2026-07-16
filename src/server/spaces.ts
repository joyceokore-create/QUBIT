import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { createStatusGroupTx, type StatusTemplateKey } from "@/server/statuses";
import { orderIndexBetween, ORDER_STEP } from "@/server/ordering";
import { UnprocessableError } from "@/server/errors";

/**
 * Hierarchy CRUD — Space / Folder / List (04-module-specs §1). Every mutation runs
 * under RLS via forTenant() and records Activity + a realtime event. Ordering is
 * fractional: create appends (max + step), reorder inserts at the midpoint.
 */

// ── ordering helpers ────────────────────────────────────────────────────────

async function nextSpaceOrder(tx: Prisma.TransactionClient): Promise<number> {
  const last = await tx.space.findFirst({ orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
  return (last?.orderIndex ?? 0) + ORDER_STEP;
}
async function nextFolderOrder(tx: Prisma.TransactionClient, spaceId: string, parentId: string | null) {
  const last = await tx.folder.findFirst({
    where: { spaceId, parentId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  return (last?.orderIndex ?? 0) + ORDER_STEP;
}
async function nextListOrder(tx: Prisma.TransactionClient, spaceId: string, folderId: string | null) {
  const last = await tx.list.findFirst({
    where: { spaceId, folderId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  return (last?.orderIndex ?? 0) + ORDER_STEP;
}

// ── Spaces ───────────────────────────────────────────────────────────────────

export async function createSpace(
  ctx: TenantContext,
  input: {
    name: string;
    icon?: string;
    color?: string;
    isPrivate?: boolean;
    settings?: Record<string, unknown>;
    statusTemplate?: StatusTemplateKey;
  },
) {
  return forTenant(ctx, async (tx) => {
    const space = await tx.space.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        isPrivate: input.isPrivate ?? false,
        settings: (input.settings ?? {}) as Prisma.InputJsonValue,
        orderIndex: await nextSpaceOrder(tx),
      },
    });
    // Every space gets a default status group its lists inherit.
    await createStatusGroupTx(tx, ctx, {
      spaceId: space.id,
      name: "Default",
      template: input.statusTemplate ?? "simple",
    });
    await recordActivity(tx, ctx, {
      objectType: "space",
      objectId: space.id,
      verb: "space.created",
      data: { name: space.name },
    });
    return space;
  });
}

export async function updateSpace(
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; icon: string | null; color: string | null; isPrivate: boolean; settings: Record<string, unknown>; archived: boolean }>,
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.space.findUnique({ where: { id }, select: { id: true } }), "Space not found.");
    const space = await tx.space.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.icon !== undefined && { icon: patch.icon }),
        ...(patch.color !== undefined && { color: patch.color }),
        ...(patch.isPrivate !== undefined && { isPrivate: patch.isPrivate }),
        ...(patch.archived !== undefined && { archived: patch.archived }),
        ...(patch.settings !== undefined && { settings: patch.settings as Prisma.InputJsonValue }),
      },
    });
    await recordActivity(tx, ctx, {
      objectType: "space",
      objectId: id,
      verb: patch.archived === true ? "space.archived" : "space.updated",
      data: { fields: Object.keys(patch) },
    });
    return space;
  });
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function createFolder(
  ctx: TenantContext,
  input: { spaceId: string; name: string; parentId?: string },
) {
  return forTenant(ctx, async (tx) => {
    assertFound(
      await tx.space.findUnique({ where: { id: input.spaceId }, select: { id: true } }),
      "Space not found.",
    );
    const folder = await tx.folder.create({
      data: {
        tenantId: ctx.tenantId,
        spaceId: input.spaceId,
        parentId: input.parentId ?? null,
        name: input.name,
        orderIndex: await nextFolderOrder(tx, input.spaceId, input.parentId ?? null),
      },
    });
    await recordActivity(tx, ctx, {
      objectType: "folder",
      objectId: folder.id,
      verb: "folder.created",
      data: { name: folder.name, spaceId: input.spaceId },
    });
    return folder;
  });
}

export async function updateFolder(
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; archived: boolean }>,
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.folder.findUnique({ where: { id }, select: { id: true } }), "Folder not found.");
    const folder = await tx.folder.update({ where: { id }, data: patch });
    await recordActivity(tx, ctx, {
      objectType: "folder",
      objectId: id,
      verb: patch.archived === true ? "folder.archived" : "folder.updated",
      data: { fields: Object.keys(patch) },
    });
    return folder;
  });
}

// ── Lists ────────────────────────────────────────────────────────────────────

export async function createList(
  ctx: TenantContext,
  input: {
    spaceId: string;
    name: string;
    folderId?: string;
    statusGroupId?: string;
    startDate?: Date;
    dueDate?: Date;
    priority?: number;
  },
) {
  return forTenant(ctx, async (tx) => {
    assertFound(
      await tx.space.findUnique({ where: { id: input.spaceId }, select: { id: true } }),
      "Space not found.",
    );
    if (input.folderId) {
      assertFound(
        await tx.folder.findUnique({ where: { id: input.folderId }, select: { id: true } }),
        "Folder not found.",
      );
    }
    const list = await tx.list.create({
      data: {
        tenantId: ctx.tenantId,
        spaceId: input.spaceId,
        folderId: input.folderId ?? null,
        name: input.name,
        statusGroupId: input.statusGroupId ?? null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        priority: input.priority ?? null,
        orderIndex: await nextListOrder(tx, input.spaceId, input.folderId ?? null),
      },
    });
    await recordActivity(tx, ctx, {
      objectType: "list",
      objectId: list.id,
      verb: "list.created",
      data: { name: list.name, spaceId: input.spaceId, folderId: input.folderId ?? null },
    });
    return list;
  });
}

export async function updateList(
  ctx: TenantContext,
  id: string,
  patch: Partial<{ name: string; archived: boolean; statusGroupId: string | null; startDate: Date | null; dueDate: Date | null; priority: number | null }>,
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.list.findUnique({ where: { id }, select: { id: true } }), "List not found.");
    const list = await tx.list.update({ where: { id }, data: patch });
    await recordActivity(tx, ctx, {
      objectType: "list",
      objectId: id,
      verb: patch.archived === true ? "list.archived" : "list.updated",
      data: { fields: Object.keys(patch) },
    });
    return list;
  });
}

// ── Reorder (fractional) ─────────────────────────────────────────────────────

export type ReorderObject = "SPACE" | "FOLDER" | "LIST";

/**
 * Move `objectId` to sit immediately after `afterId` (or to the start when omitted)
 * among its siblings, using a midpoint orderIndex so only one row changes.
 * Siblings are scoped to the object's own container (space / folder parent / list folder).
 */
export async function reorder(
  ctx: TenantContext,
  input: { objectType: ReorderObject; objectId: string; afterId?: string | null },
) {
  return forTenant(ctx, async (tx) => {
    const siblings = await loadSiblings(tx, input.objectType, input.objectId);
    const ordered = siblings.filter((s) => s.id !== input.objectId);

    let beforeIdx: number | null = null;
    let afterIdx: number | null = null;
    if (input.afterId) {
      const pos = ordered.findIndex((s) => s.id === input.afterId);
      if (pos === -1) throw new UnprocessableError("afterId is not a sibling of the moved object.");
      beforeIdx = ordered[pos].orderIndex;
      afterIdx = ordered[pos + 1]?.orderIndex ?? null;
    } else {
      afterIdx = ordered[0]?.orderIndex ?? null;
    }

    const orderIndex = orderIndexBetween(beforeIdx, afterIdx);
    await updateOrderIndex(tx, input.objectType, input.objectId, orderIndex);
    await recordActivity(tx, ctx, {
      objectType: input.objectType.toLowerCase(),
      objectId: input.objectId,
      verb: `${input.objectType.toLowerCase()}.reordered`,
      data: { orderIndex },
    });
    return { id: input.objectId, orderIndex };
  });
}

async function loadSiblings(
  tx: Prisma.TransactionClient,
  type: ReorderObject,
  objectId: string,
): Promise<{ id: string; orderIndex: number }[]> {
  if (type === "SPACE") {
    assertFound(await tx.space.findUnique({ where: { id: objectId }, select: { id: true } }), "Space not found.");
    return tx.space.findMany({ orderBy: { orderIndex: "asc" }, select: { id: true, orderIndex: true } });
  }
  if (type === "FOLDER") {
    const self = assertFound(
      await tx.folder.findUnique({ where: { id: objectId }, select: { spaceId: true, parentId: true } }),
      "Folder not found.",
    );
    return tx.folder.findMany({
      where: { spaceId: self.spaceId, parentId: self.parentId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, orderIndex: true },
    });
  }
  const self = assertFound(
    await tx.list.findUnique({ where: { id: objectId }, select: { spaceId: true, folderId: true } }),
    "List not found.",
  );
  return tx.list.findMany({
    where: { spaceId: self.spaceId, folderId: self.folderId },
    orderBy: { orderIndex: "asc" },
    select: { id: true, orderIndex: true },
  });
}

async function updateOrderIndex(
  tx: Prisma.TransactionClient,
  type: ReorderObject,
  id: string,
  orderIndex: number,
): Promise<void> {
  if (type === "SPACE") await tx.space.update({ where: { id }, data: { orderIndex } });
  else if (type === "FOLDER") await tx.folder.update({ where: { id }, data: { orderIndex } });
  else await tx.list.update({ where: { id }, data: { orderIndex } });
}

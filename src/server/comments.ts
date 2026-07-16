import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant";
import { forTenant, assertFound } from "@/server/tenant-db";
import { recordActivity } from "@/server/activity";
import { NotFoundError, UnprocessableError } from "@/server/errors";

/**
 * Task comments (04-module-specs §2): one-level threads, emoji reactions, and
 * "assigned comments" — a comment assigned to a user as a resolvable action item.
 * Content is opaque editor JSON here (TipTap package lands in Phase 4).
 */

const authorSelect = { id: true, name: true } satisfies Prisma.UserSelect;

const commentSelect = {
  id: true,
  parentId: true,
  content: true,
  assignedToId: true,
  resolvedAt: true,
  reactions: true,
  editedAt: true,
  createdAt: true,
  author: { select: authorSelect },
} satisfies Prisma.CommentSelect;

/** Top-level comments (newest activity last) with their non-deleted replies. */
export async function listComments(ctx: TenantContext, taskId: string) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    return tx.comment.findMany({
      where: { taskId, parentId: null, deletedAt: null },
      select: {
        ...commentSelect,
        replies: {
          where: { deletedAt: null },
          select: commentSelect,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  });
}

export async function addComment(
  ctx: TenantContext,
  taskId: string,
  input: { content: Record<string, unknown>; parentId?: string; assignedToId?: string },
) {
  return forTenant(ctx, async (tx) => {
    assertFound(await tx.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } }), "Task not found.");
    if (input.parentId) {
      const parent = await tx.comment.findFirst({
        where: { id: input.parentId, taskId, deletedAt: null },
        select: { parentId: true },
      });
      if (!parent) throw new NotFoundError("Parent comment not found.");
      if (parent.parentId) throw new UnprocessableError("Comments only thread one level deep.");
    }
    if (input.assignedToId) {
      assertFound(await tx.user.findUnique({ where: { id: input.assignedToId }, select: { id: true } }), "Assignee not found.");
    }
    const comment = await tx.comment.create({
      data: {
        tenantId: ctx.tenantId,
        taskId,
        authorId: ctx.userId,
        parentId: input.parentId ?? null,
        content: input.content as Prisma.InputJsonValue,
        assignedToId: input.assignedToId ?? null,
      },
      select: commentSelect,
    });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: taskId,
      verb: input.assignedToId ? "comment.assigned" : "comment.added",
      data: { commentId: comment.id, assignedToId: input.assignedToId ?? null },
    });
    return comment;
  });
}

async function commentTaskId(tx: Prisma.TransactionClient, id: string): Promise<{ taskId: string }> {
  const c = await tx.comment.findFirst({ where: { id, deletedAt: null }, select: { taskId: true } });
  if (!c) throw new NotFoundError("Comment not found.");
  return c;
}

export async function editComment(ctx: TenantContext, id: string, content: Record<string, unknown>) {
  return forTenant(ctx, async (tx) => {
    const { taskId } = await commentTaskId(tx, id);
    const comment = await tx.comment.update({
      where: { id },
      data: { content: content as Prisma.InputJsonValue, editedAt: new Date() },
      select: commentSelect,
    });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "comment.edited", data: { commentId: id } });
    return comment;
  });
}

export async function deleteComment(ctx: TenantContext, id: string) {
  return forTenant(ctx, async (tx) => {
    const { taskId } = await commentTaskId(tx, id);
    await tx.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordActivity(tx, ctx, { objectType: "task", objectId: taskId, verb: "comment.deleted", data: { commentId: id } });
    return { id };
  });
}

/** Resolve / reopen an assigned comment. */
export async function setResolved(ctx: TenantContext, id: string, resolved: boolean) {
  return forTenant(ctx, async (tx) => {
    const { taskId } = await commentTaskId(tx, id);
    const comment = await tx.comment.update({
      where: { id },
      data: { resolvedAt: resolved ? new Date() : null },
      select: commentSelect,
    });
    await recordActivity(tx, ctx, {
      objectType: "task",
      objectId: taskId,
      verb: resolved ? "comment.resolved" : "comment.reopened",
      data: { commentId: id },
    });
    return comment;
  });
}

/** Toggle the current user's reaction with `emoji`. */
export async function toggleReaction(ctx: TenantContext, id: string, emoji: string) {
  return forTenant(ctx, async (tx) => {
    const comment = await tx.comment.findFirst({ where: { id, deletedAt: null }, select: { reactions: true } });
    if (!comment) throw new NotFoundError("Comment not found.");
    const reactions = { ...((comment.reactions as Record<string, string[]>) ?? {}) };
    const users = new Set(reactions[emoji] ?? []);
    if (users.has(ctx.userId)) users.delete(ctx.userId);
    else users.add(ctx.userId);
    if (users.size === 0) delete reactions[emoji];
    else reactions[emoji] = [...users];
    return tx.comment.update({
      where: { id },
      data: { reactions: reactions as Prisma.InputJsonValue },
      select: commentSelect,
    });
  });
}

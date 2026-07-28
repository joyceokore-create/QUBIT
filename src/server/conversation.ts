import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { canWriteProject } from "@/lib/access";
import { emitDomainEvent } from "@/server/events";

/**
 * Conversation attached to work (M4, docs/16-revamp-plan.md §4): threaded comments with
 * @mentions on tasks, projects, risks and documents — the things chat apps are bad at.
 * Any authenticated tenant user may comment (global read, DM1.3 — an exec asking a
 * question on a task IS the point); deleting is author-or-PM; promoting a thread's
 * outcome to a Decision is PM-level governance (canWriteProject). Long-form debate
 * stays in Teams — the conclusion comes home to QUBIT.
 */

export const COMMENT_ENTITY_TYPES = ["project", "project_task", "risk", "project_document"] as const;
export type CommentEntityType = (typeof COMMENT_ENTITY_TYPES)[number];

export class ConversationError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "FORBIDDEN" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

/** Validate the target exists and derive its project + a human label + a deep link. */
async function resolveEntity(
  tx: Prisma.TransactionClient,
  entityType: CommentEntityType,
  entityId: string,
): Promise<{ projectId: string | null; label: string; link: string }> {
  switch (entityType) {
    case "project": {
      const p = await tx.project.findUnique({ where: { id: entityId }, select: { id: true, name: true } });
      if (!p) throw new ConversationError("Project not found.", "NOT_FOUND");
      return { projectId: p.id, label: p.name, link: `/projects/${p.id}` };
    }
    case "project_task": {
      const t = await tx.projectTask.findUnique({
        where: { id: entityId },
        select: { projectId: true, title: true, taskKey: true },
      });
      if (!t) throw new ConversationError("Task not found.", "NOT_FOUND");
      return {
        projectId: t.projectId,
        label: t.taskKey ?? t.title.slice(0, 60),
        link: `/projects/${t.projectId}?tab=Board&task=${entityId}`,
      };
    }
    case "risk": {
      const r = await tx.risk.findUnique({ where: { id: entityId }, select: { projectId: true, title: true } });
      if (!r) throw new ConversationError("Risk not found.", "NOT_FOUND");
      return { projectId: r.projectId, label: r.title.slice(0, 60), link: "/risks" };
    }
    case "project_document": {
      const d = await tx.projectDocument.findUnique({ where: { id: entityId }, select: { projectId: true, title: true } });
      if (!d) throw new ConversationError("Document not found.", "NOT_FOUND");
      return { projectId: d.projectId, label: d.title.slice(0, 60), link: `/projects/${d.projectId}?tab=Documents` };
    }
  }
}

export interface CommentView {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  mentions: { id: string; name: string }[];
  decisionId: string | null;
  createdAt: Date;
  replies: CommentView[];
}

export async function listComments(
  ctx: TenantContext,
  entityType: CommentEntityType,
  entityId: string,
): Promise<CommentView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.workComment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { name: true } } },
    });
    const mentionIds = [...new Set(rows.flatMap((r) => r.mentions))];
    const mentionUsers = mentionIds.length
      ? await tx.user.findMany({ where: { id: { in: mentionIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(mentionUsers.map((u) => [u.id, u.name]));

    const toView = (r: (typeof rows)[number]): CommentView => ({
      id: r.id,
      parentId: r.parentId,
      authorId: r.authorId,
      authorName: r.author.name,
      body: r.body,
      mentions: r.mentions.map((id) => ({ id, name: nameById.get(id) ?? "Unknown" })),
      decisionId: r.decisionId,
      createdAt: r.createdAt,
      replies: [],
    });

    const roots: CommentView[] = [];
    const byId = new Map<string, CommentView>();
    for (const r of rows) {
      const v = toView(r);
      byId.set(v.id, v);
      if (!r.parentId) roots.push(v);
    }
    for (const r of rows) {
      if (r.parentId) (byId.get(r.parentId)?.replies ?? roots).push(byId.get(r.id)!);
    }
    return roots;
  });
}

export const PostCommentInput = z.object({
  entityType: z.enum(COMMENT_ENTITY_TYPES),
  entityId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  body: z.string().trim().min(1, "Say something.").max(4000),
  mentionUserIds: z.array(z.string()).max(20).default([]),
});
export type PostCommentInputT = z.infer<typeof PostCommentInput>;

export async function postComment(ctx: TenantContext, input: PostCommentInputT): Promise<CommentView> {
  return withTenant(ctx, async (tx) => {
    const entity = await resolveEntity(tx, input.entityType, input.entityId);

    // Replies attach to the ROOT (one-level threads) and must share the entity.
    let rootId: string | null = null;
    let rootAuthorId: string | null = null;
    if (input.parentId) {
      const parent = await tx.workComment.findUnique({
        where: { id: input.parentId },
        select: { id: true, parentId: true, authorId: true, entityType: true, entityId: true },
      });
      if (!parent || parent.entityType !== input.entityType || parent.entityId !== input.entityId) {
        throw new ConversationError("Parent comment not found on this item.", "NOT_FOUND");
      }
      rootId = parent.parentId ?? parent.id;
      rootAuthorId = parent.authorId;
    }

    // Mentions are validated against the tenant (RLS scopes the lookup) — a bad id is
    // dropped, never stored.
    const mentioned = input.mentionUserIds.length
      ? await tx.user.findMany({
          where: { id: { in: input.mentionUserIds }, status: { not: "DELETED" } },
          select: { id: true, name: true },
        })
      : [];

    const row = await tx.workComment.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        projectId: entity.projectId,
        parentId: rootId,
        authorId: ctx.userId,
        body: input.body,
        mentions: mentioned.map((m) => m.id),
      },
      include: { author: { select: { name: true } } },
    });

    // One event, many reactions: mentioned users + the thread's root author get pinged
    // (never the poster); the row itself feeds the activity feed and later digests.
    const recipients = new Map<string, { kind: string; message: string }>();
    for (const m of mentioned) {
      if (m.id !== ctx.userId) {
        recipients.set(m.id, {
          kind: "mention",
          message: `${row.author.name} mentioned you on ${entity.label}: ${input.body.slice(0, 80)}`,
        });
      }
    }
    if (rootAuthorId && rootAuthorId !== ctx.userId && !recipients.has(rootAuthorId)) {
      recipients.set(rootAuthorId, {
        kind: "comment_reply",
        message: `${row.author.name} replied on ${entity.label}: ${input.body.slice(0, 80)}`,
      });
    }
    await emitDomainEvent(tx, ctx, {
      type: "comment.posted",
      entityType: input.entityType,
      entityId: input.entityId,
      payload: { projectId: entity.projectId, commentId: row.id, mentions: mentioned.length, reply: !!rootId },
      notify: [...recipients.entries()].map(([userId, n]) => ({ userId, kind: n.kind, message: n.message, link: entity.link })),
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "work_comment",
      entityId: row.id,
      after: { on: `${input.entityType}:${input.entityId}`, mentions: mentioned.length },
    });

    return {
      id: row.id,
      parentId: row.parentId,
      authorId: row.authorId,
      authorName: row.author.name,
      body: row.body,
      mentions: mentioned,
      decisionId: null,
      createdAt: row.createdAt,
      replies: [],
    };
  });
}

/** Author may delete their own comment; the project's PMs may moderate. Replies cascade. */
export async function deleteComment(ctx: TenantContext, commentId: string): Promise<void> {
  const row = await withTenant(ctx, (tx) =>
    tx.workComment.findUnique({ where: { id: commentId }, select: { authorId: true, projectId: true, entityType: true, entityId: true } }),
  );
  if (!row) throw new ConversationError("Comment not found.", "NOT_FOUND");
  const allowed = row.authorId === ctx.userId || (row.projectId ? await canWriteProject(ctx, row.projectId) : false);
  if (!allowed) throw new ConversationError("Only the author or a project manager can delete a comment.", "FORBIDDEN");
  await withTenant(ctx, async (tx) => {
    await tx.workComment.delete({ where: { id: commentId } });
    await audit(tx, ctx, {
      action: "delete",
      entityType: "work_comment",
      entityId: commentId,
      before: { on: `${row.entityType}:${row.entityId}` },
    });
  });
}

export const PromoteInput = z.object({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().trim().max(2000).optional(),
});
export type PromoteInputT = z.infer<typeof PromoteInput>;

export interface DecisionView {
  id: string;
  title: string;
  rationale: string | null;
  decidedByName: string | null;
  decidedAt: Date;
  sourceCommentId: string | null;
}

/** One click: a comment thread's outcome becomes a Decision on the project (§4 —
 * the missing "D" in RAID). PM-level: a decision log the whole team can write is a
 * suggestion box, not a record. */
export async function promoteToDecision(
  ctx: TenantContext,
  commentId: string,
  input: PromoteInputT,
): Promise<DecisionView> {
  const comment = await withTenant(ctx, (tx) =>
    tx.workComment.findUnique({
      where: { id: commentId },
      select: { id: true, projectId: true, decisionId: true, body: true },
    }),
  );
  if (!comment) throw new ConversationError("Comment not found.", "NOT_FOUND");
  if (!comment.projectId) {
    throw new ConversationError("Only comments on project work can become project decisions.", "BAD_INPUT");
  }
  if (comment.decisionId) throw new ConversationError("This comment is already a decision.", "BAD_INPUT");
  if (!(await canWriteProject(ctx, comment.projectId))) {
    throw new ConversationError("Recording a decision is PM-level.", "FORBIDDEN");
  }

  return withTenant(ctx, async (tx) => {
    const decision = await tx.decision.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: comment.projectId!,
        title: input.title,
        rationale: input.rationale ?? comment.body.slice(0, 2000),
        decidedById: ctx.userId,
        sourceCommentId: comment.id,
      },
      include: { decidedBy: { select: { name: true } } },
    });
    await tx.workComment.update({ where: { id: comment.id }, data: { decisionId: decision.id } });
    await emitDomainEvent(tx, ctx, {
      type: "decision.recorded",
      entityType: "decision",
      entityId: decision.id,
      payload: { projectId: comment.projectId, title: input.title, sourceCommentId: comment.id },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "decision",
      entityId: decision.id,
      after: { title: input.title, sourceCommentId: comment.id },
    });
    return {
      id: decision.id,
      title: decision.title,
      rationale: decision.rationale,
      decidedByName: decision.decidedBy?.name ?? null,
      decidedAt: decision.decidedAt,
      sourceCommentId: decision.sourceCommentId,
    };
  });
}

export async function listDecisions(ctx: TenantContext, projectId: string): Promise<DecisionView[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.decision.findMany({
      where: { projectId },
      orderBy: { decidedAt: "desc" },
      include: { decidedBy: { select: { name: true } } },
    });
    return rows.map((d) => ({
      id: d.id,
      title: d.title,
      rationale: d.rationale,
      decidedByName: d.decidedBy?.name ?? null,
      decidedAt: d.decidedAt,
      sourceCommentId: d.sourceCommentId,
    }));
  });
}

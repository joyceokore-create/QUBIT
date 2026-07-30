import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { emitDomainEvent } from "@/server/events";

/**
 * Project Workspace documents (BRD, plans, specs). `content` is the text/markdown body
 * (what Q will ground on); `fileData` is a base64 blob for PDF uploads (download only).
 * Tenant-scoped (RLS) + audited.
 */

// docs/16 §6 — the register's document types. Handover/Signoff/TestPlan feed the M8-A
// gate checklists; URS/SRS become requirement sources in M8-C.
export const DOC_KINDS = ["BRD", "URS", "SRS", "Design", "TestPlan", "Signoff", "Handover", "Plan", "Note", "Other"] as const;
export const DOC_STATUSES = ["Draft", "InReview", "Approved", "Rejected"] as const;
export const DOC_STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  InReview: "In review",
  Approved: "Approved",
  Rejected: "Rejected",
};

export class DocumentError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT" | "FORBIDDEN" | "BAD_STATE",
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface DocumentApprovalRow {
  approverId: string;
  approverName: string;
  decision: "Pending" | "Approved" | "Rejected";
  comment: string | null;
  decidedAt: Date | null;
}

export interface DocumentRow {
  id: string;
  title: string;
  kind: string;
  format: string;
  status: string;
  source: string;
  authorName: string | null;
  hasFile: boolean;
  createdAt: Date;
  /** docs/16 §6 — versioning: a new version supersedes rather than overwrites. */
  version: number;
  supersedesId: string | null;
  /** True when a newer version exists — the old one stays readable but is marked. */
  superseded: boolean;
  approvals: DocumentApprovalRow[];
}

export interface DocumentDetail extends DocumentRow {
  content: string | null;
  fileData: string | null;
}

export async function listDocuments(ctx: TenantContext, projectId: string): Promise<DocumentRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.projectDocument.findMany({
      where: { projectId },
      select: {
        id: true, title: true, kind: true, format: true, status: true, source: true,
        createdAt: true, fileData: true, version: true, supersedesId: true,
        createdBy: { select: { name: true } },
        supersededBy: { select: { id: true } },
        approvals: {
          select: {
            approverId: true, decision: true, comment: true, decidedAt: true,
            approver: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
    return rows.map((d) => ({
      id: d.id,
      title: d.title,
      kind: d.kind,
      format: d.format,
      status: d.status,
      source: d.source,
      authorName: d.createdBy?.name ?? null,
      hasFile: Boolean(d.fileData),
      createdAt: d.createdAt,
      version: d.version,
      supersedesId: d.supersedesId,
      superseded: d.supersededBy.length > 0,
      approvals: d.approvals.map((a) => ({
        approverId: a.approverId,
        approverName: a.approver.name,
        decision: a.decision as DocumentApprovalRow["decision"],
        comment: a.comment,
        decidedAt: a.decidedAt,
      })),
    }));
  });
}

export async function getDocument(ctx: TenantContext, id: string): Promise<DocumentDetail | null> {
  return withTenant(ctx, async (tx) => {
    const d = await tx.projectDocument.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        supersededBy: { select: { id: true } },
        approvals: {
          select: {
            approverId: true, decision: true, comment: true, decidedAt: true,
            approver: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!d) return null;
    return {
      id: d.id,
      title: d.title,
      kind: d.kind,
      format: d.format,
      status: d.status,
      source: d.source,
      authorName: d.createdBy?.name ?? null,
      hasFile: Boolean(d.fileData),
      createdAt: d.createdAt,
      version: d.version,
      supersedesId: d.supersedesId,
      superseded: d.supersededBy.length > 0,
      approvals: d.approvals.map((a) => ({
        approverId: a.approverId,
        approverName: a.approver.name,
        decision: a.decision as DocumentApprovalRow["decision"],
        comment: a.comment,
        decidedAt: a.decidedAt,
      })),
      content: d.content,
      fileData: d.fileData,
    };
  });
}

/** projectId of a document (for access checks). */
export async function documentProjectId(ctx: TenantContext, id: string): Promise<string | null> {
  return withTenant(ctx, (tx) =>
    tx.projectDocument.findUnique({ where: { id }, select: { projectId: true } }).then((d) => d?.projectId ?? null),
  );
}

export const CreateDocumentInput = z
  .object({
    title: z.string().min(1),
    kind: z.enum(DOC_KINDS).optional(),
    format: z.enum(["text", "markdown", "pdf"]).optional(),
    content: z.string().nullable().optional(),
    fileData: z.string().nullable().optional(),
    status: z.enum(DOC_STATUSES).optional(),
    source: z.enum(["Uploaded", "AIDrafted"]).optional(),
  })
  .refine((v) => Boolean(v.content?.trim()) || Boolean(v.fileData), {
    message: "A document needs text content or an attached file.",
  });
export type CreateDocumentInput = z.infer<typeof CreateDocumentInput>;

export async function createDocument(ctx: TenantContext, projectId: string, input: CreateDocumentInput) {
  return withTenant(ctx, async (tx) => {
    await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const doc = await tx.projectDocument.create({
      data: {
        tenantId: ctx.tenantId,
        projectId,
        title: input.title,
        kind: input.kind ?? "Other",
        format: input.format ?? (input.fileData ? "pdf" : "text"),
        content: input.content ?? null,
        fileData: input.fileData ?? null,
        // docs/16 §6: documents enter the register as drafts and are approved through
        // the review workflow — nothing arrives pre-approved.
        status: input.status ?? "Draft",
        source: input.source ?? "Uploaded",
        createdById: ctx.userId,
      },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "project_document",
      entityId: doc.id,
      after: { title: doc.title, kind: doc.kind, status: doc.status },
    });
    return doc;
  });
}

export async function updateDocumentStatus(ctx: TenantContext, id: string, status: (typeof DOC_STATUSES)[number]) {
  return withTenant(ctx, async (tx) => {
    const before = await tx.projectDocument.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw new DocumentError("Document not found.", "NOT_FOUND");
    const doc = await tx.projectDocument.update({ where: { id }, data: { status } });
    await audit(tx, ctx, {
      action: "update",
      entityType: "project_document",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
    return doc;
  });
}

// ── Review workflow (docs/16 §6) ────────────────────────────────────────────────

export const SubmitForReviewInput = z.object({
  approverIds: z.array(z.string().uuid()).min(1, "Name at least one approver.").max(10),
});

/** Draft → InReview, naming the approvers. Re-submitting after a rejection clears the
 * previous decisions: a fresh review, not a half-remembered one. */
export async function submitForReview(
  ctx: TenantContext,
  id: string,
  approverIds: string[],
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const doc = await tx.projectDocument.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, projectId: true },
    });
    if (!doc) throw new DocumentError("Document not found.", "NOT_FOUND");
    if (doc.status === "Approved") {
      throw new DocumentError("That document is already approved — raise a new version instead.", "BAD_STATE");
    }
    const users = await tx.user.findMany({ where: { id: { in: approverIds } }, select: { id: true } });
    if (users.length !== approverIds.length) throw new DocumentError("Unknown approver.", "BAD_INPUT");

    await tx.documentApproval.deleteMany({ where: { documentId: id } });
    await tx.documentApproval.createMany({
      data: approverIds.map((approverId) => ({ tenantId: ctx.tenantId, documentId: id, approverId })),
    });
    await tx.projectDocument.update({ where: { id }, data: { status: "InReview" } });

    await audit(tx, ctx, {
      action: "update",
      entityType: "project_document",
      entityId: id,
      before: { status: doc.status },
      after: { status: "InReview", approvers: approverIds.length },
    });
    await emitDomainEvent(tx, ctx, {
      type: "document.submitted",
      entityType: "project_document",
      entityId: id,
      payload: { projectId: doc.projectId, approvers: approverIds.length },
      notify: approverIds
        .filter((u) => u !== ctx.userId)
        .map((userId) => ({
          userId,
          kind: "document_review",
          message: `"${doc.title}" needs your approval`,
          link: `/projects/${doc.projectId}?tab=Documents`,
        })),
    });
  });
}

export const DecisionInput = z.object({
  decision: z.enum(["Approved", "Rejected"]),
  comment: z.string().trim().max(500).nullable().optional(),
});

/** Record one named approver's decision. The document reaches Approved only when every
 * named approver has approved; ONE rejection sends it back to the author. */
export async function recordDecision(
  ctx: TenantContext,
  id: string,
  input: { decision: "Approved" | "Rejected"; comment?: string | null },
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const doc = await tx.projectDocument.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, projectId: true, createdById: true },
    });
    if (!doc) throw new DocumentError("Document not found.", "NOT_FOUND");
    if (doc.status !== "InReview") throw new DocumentError("That document is not in review.", "BAD_STATE");

    const mine = await tx.documentApproval.findUnique({
      where: { documentId_approverId: { documentId: id, approverId: ctx.userId } },
      select: { id: true },
    });
    // Only the people who were NAMED may decide — not anyone who can see the project.
    if (!mine) throw new DocumentError("You are not a named approver on this document.", "FORBIDDEN");

    await tx.documentApproval.update({
      where: { id: mine.id },
      data: { decision: input.decision, comment: input.comment ?? null, decidedAt: new Date() },
    });

    const all = await tx.documentApproval.findMany({ where: { documentId: id }, select: { decision: true } });
    const nextStatus =
      all.some((a) => a.decision === "Rejected")
        ? "Rejected"
        : all.every((a) => a.decision === "Approved")
          ? "Approved"
          : "InReview";
    if (nextStatus !== doc.status) {
      await tx.projectDocument.update({ where: { id }, data: { status: nextStatus } });
    }

    await audit(tx, ctx, {
      action: "update",
      entityType: "project_document",
      entityId: id,
      before: { status: doc.status },
      after: { decision: input.decision, status: nextStatus },
    });
    await emitDomainEvent(tx, ctx, {
      type: "document.decided",
      entityType: "project_document",
      entityId: id,
      payload: { projectId: doc.projectId, decision: input.decision, status: nextStatus },
      notify:
        doc.createdById && doc.createdById !== ctx.userId
          ? [
              {
                userId: doc.createdById,
                kind: "document_review",
                message: `"${doc.title}" was ${input.decision === "Approved" ? "approved" : "sent back"}`,
                link: `/projects/${doc.projectId}?tab=Documents`,
              },
            ]
          : [],
    });
  });
}

/** Raise the next version of a document. The predecessor is kept and linked, so the
 * approved history stays readable instead of being overwritten (docs/16 §6). */
export async function newVersion(
  ctx: TenantContext,
  id: string,
  input: { title?: string; content?: string | null },
): Promise<{ id: string }> {
  return withTenant(ctx, async (tx) => {
    const prev = await tx.projectDocument.findUnique({ where: { id } });
    if (!prev) throw new DocumentError("Document not found.", "NOT_FOUND");

    const created = await tx.projectDocument.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: prev.projectId,
        title: input.title ?? prev.title,
        kind: prev.kind,
        format: prev.format,
        content: input.content !== undefined ? input.content : prev.content,
        fileData: prev.fileData,
        status: "Draft",
        source: prev.source,
        createdById: ctx.userId,
        version: prev.version + 1,
        supersedesId: prev.id,
      },
      select: { id: true, version: true },
    });
    await audit(tx, ctx, {
      action: "create",
      entityType: "project_document",
      entityId: created.id,
      after: { version: created.version, supersedes: prev.id, title: input.title ?? prev.title },
    });
    return { id: created.id };
  });
}

export async function deleteDocument(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    await tx.projectDocument.deleteMany({ where: { id } });
    await audit(tx, ctx, { action: "delete", entityType: "project_document", entityId: id, before: { id } });
    return { id };
  });
}

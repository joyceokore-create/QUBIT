import { z } from "zod";
import { withTenant, type TenantContext } from "@/lib/tenant";
import { audit } from "@/lib/audit";

/**
 * Project Workspace documents (BRD, plans, specs). `content` is the text/markdown body
 * (what Q will ground on); `fileData` is a base64 blob for PDF uploads (download only).
 * Tenant-scoped (RLS) + audited.
 */

export const DOC_KINDS = ["BRD", "Plan", "Spec", "Note", "Other"] as const;
export const DOC_STATUSES = ["Draft", "PendingReview", "Final"] as const;

export class DocumentError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "DocumentError";
  }
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
        createdAt: true, fileData: true, createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
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
    }));
  });
}

export async function getDocument(ctx: TenantContext, id: string): Promise<DocumentDetail | null> {
  return withTenant(ctx, async (tx) => {
    const d = await tx.projectDocument.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
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
        status: input.status ?? "Final",
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

export async function deleteDocument(ctx: TenantContext, id: string) {
  return withTenant(ctx, async (tx) => {
    await tx.projectDocument.deleteMany({ where: { id } });
    await audit(tx, ctx, { action: "delete", entityType: "project_document", entityId: id, before: { id } });
    return { id };
  });
}

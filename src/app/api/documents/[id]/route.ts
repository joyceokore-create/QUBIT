import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { requirePermission } from "@/lib/api-guard";
import {
  getDocument,
  documentProjectId,
  deleteDocument,
  updateDocumentStatus,
  DOC_STATUSES,
  DocumentError,
} from "@/server/documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  const projectId = await documentProjectId(ctx, id);
  if (!projectId) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!(await canViewProject(ctx, projectId))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const doc = await getDocument(ctx, id);
  return NextResponse.json({ document: doc });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!DOC_STATUSES.includes(status)) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid status." } }, { status: 400 });
  }
  const { id } = await params;
  try {
    await updateDocumentStatus(guard.ctx, id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DocumentError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  await deleteDocument(guard.ctx, id);
  return NextResponse.json({ ok: true });
}

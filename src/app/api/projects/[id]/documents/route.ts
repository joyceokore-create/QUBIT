import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { requirePermission } from "@/lib/api-guard";
import { listDocuments, createDocument, CreateDocumentInput, DocumentError } from "@/server/documents";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canViewProject(ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  return NextResponse.json({ data: await listDocuments(ctx, id) });
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = CreateDocumentInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid document." } },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    const doc = await createDocument(guard.ctx, id, parsed.data);
    return NextResponse.json({ id: doc.id }, { status: 201 });
  } catch (e) {
    if (e instanceof DocumentError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

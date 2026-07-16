import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canViewProject } from "@/lib/project-access";
import { requirePermission } from "@/lib/api-guard";
import { listStatusUpdates, postStatusUpdate, PostStatusInput } from "@/server/status-updates";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canViewProject(ctx, id))) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  return NextResponse.json({ data: await listStatusUpdates(ctx, id) });
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const parsed = PostStatusInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "A status update needs a body." } }, { status: 400 });
  }
  const { id } = await params;
  return NextResponse.json(await postStatusUpdate(guard.ctx, id, parsed.data), { status: 201 });
}

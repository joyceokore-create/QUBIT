import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canContributeToProject } from "@/lib/access";
import { listBlockers, createBlocker, CreateBlockerInput, BlockerError } from "@/server/blockers";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  return NextResponse.json({ data: await listBlockers(guard.ctx, { projectId: id }) });
}

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canContributeToProject(guard.ctx, id))) {
    return forbidden("You can only raise blockers on a project you're part of.");
  }
  const parsed = CreateBlockerInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid blocker." } }, { status: 400 });
  }
  try {
    const b = await createBlocker(guard.ctx, id, parsed.data);
    return NextResponse.json({ id: b.id }, { status: 201 });
  } catch (e) {
    if (e instanceof BlockerError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

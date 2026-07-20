import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteBlocker } from "@/lib/access";
import { updateBlocker, removeBlocker, UpdateBlockerInput, BlockerError } from "@/server/blockers";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteBlocker(guard.ctx, id))) {
    return forbidden("You can only edit blockers on a project you're part of.");
  }
  const parsed = UpdateBlockerInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid update." } }, { status: 400 });
  }
  try {
    await updateBlocker(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof BlockerError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteBlocker(guard.ctx, id))) {
    return forbidden("You can only delete blockers on a project you're part of.");
  }
  await removeBlocker(guard.ctx, id);
  return NextResponse.json({ ok: true });
}

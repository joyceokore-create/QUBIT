import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { removeProjectMember } from "@/server/resources";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const { id, userId } = await params;
  await removeProjectMember(guard.ctx, id, userId);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { setUserStatus, UserAdminError } from "@/server/users";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("users:suspend");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  try {
    await setUserStatus(guard.ctx, id, "SUSPENDED");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UserAdminError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

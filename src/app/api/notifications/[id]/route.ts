import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { markRead } from "@/server/notifications";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, { params }: Ctx) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  await markRead(ctx, id);
  return NextResponse.json({ ok: true });
}

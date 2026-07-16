import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { markAllRead } from "@/server/notifications";

export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  await markAllRead(ctx);
  return NextResponse.json({ ok: true });
}

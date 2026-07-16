import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { listNotifications, unreadCount } from "@/server/notifications";

export async function GET() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const [items, unread] = await Promise.all([listNotifications(ctx), unreadCount(ctx)]);
  return NextResponse.json({ items, unread });
}

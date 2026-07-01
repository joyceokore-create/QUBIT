import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getEscalations } from "@/server/dashboard";

export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  const escalations = await getEscalations(guard.ctx);
  return NextResponse.json({ items: escalations });
}

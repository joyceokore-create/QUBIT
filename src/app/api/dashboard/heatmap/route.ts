import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getHeatmap } from "@/server/dashboard";

export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  const heatmap = await getHeatmap(guard.ctx);
  return NextResponse.json(heatmap);
}

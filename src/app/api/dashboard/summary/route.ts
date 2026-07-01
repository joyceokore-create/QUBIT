import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getDashboardSummary } from "@/server/dashboard";

export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;

  const summary = await getDashboardSummary(guard.ctx);
  return NextResponse.json(summary);
}

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getGapReport } from "@/server/raid";

export async function GET() {
  const guard = await requirePermission("risk:read");
  if ("response" in guard) return guard.response;

  const report = await getGapReport(guard.ctx);
  return NextResponse.json(report);
}

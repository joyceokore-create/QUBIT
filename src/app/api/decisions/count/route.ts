import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { countWaitingDecisions } from "@/server/decision-requests";

// WS2 — the Decisions sidebar badge: decisions waiting on the Group (RLS-scoped).
export async function GET() {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ waiting: await countWaitingDecisions(guard.ctx) });
}

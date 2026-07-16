import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { listTeams } from "@/server/teams";

// Lightweight team list for pickers (assigning teams to projects). Read-only.
export async function GET() {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await listTeams(guard.ctx) });
}

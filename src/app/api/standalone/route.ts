import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getStandaloneCards } from "@/server/dashboard";

export async function GET() {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;

  const items = await getStandaloneCards(guard.ctx);
  return NextResponse.json({ items });
}

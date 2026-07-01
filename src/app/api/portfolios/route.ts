import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getPortfolioCards } from "@/server/dashboard";

export async function GET() {
  const guard = await requirePermission("portfolio:read");
  if ("response" in guard) return guard.response;

  const portfolios = await getPortfolioCards(guard.ctx);
  return NextResponse.json({ items: portfolios });
}

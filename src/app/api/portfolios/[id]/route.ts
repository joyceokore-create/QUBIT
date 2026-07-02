import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getPortfolioDetail } from "@/server/projects";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("portfolio:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const portfolio = await getPortfolioDetail(guard.ctx, id);
  if (!portfolio) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Portfolio not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(portfolio);
}

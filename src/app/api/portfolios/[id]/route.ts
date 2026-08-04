import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getPortfolioDetail } from "@/server/projects";
import { PortfolioError, updatePortfolio, UpdatePortfolioSchema } from "@/server/portfolios";

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

// docs/27 §5 gap 1 — governance edits. Same key that creates (Exec/Head).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("portfolio:create");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const parsed = UpdatePortfolioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    const portfolio = await updatePortfolio(guard.ctx, id, parsed.data);
    return NextResponse.json({ portfolio: { id: portfolio.id, name: portfolio.name, category: portfolio.category } });
  } catch (e) {
    if (e instanceof PortfolioError) {
      const status = e.code === "PORTFOLIO_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

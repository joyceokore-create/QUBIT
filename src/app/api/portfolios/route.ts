import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { getPortfolioCards } from "@/server/dashboard";
import { CreatePortfolioSchema, createPortfolio, PortfolioError } from "@/server/portfolios";

export async function GET() {
  const guard = await requirePermission("portfolio:read");
  if ("response" in guard) return guard.response;

  const portfolios = await getPortfolioCards(guard.ctx);
  return NextResponse.json({ items: portfolios });
}

// M-P1b (docs/27) — the wizard's create. Exec / Head only (portfolio:create).
export async function POST(req: Request) {
  const guard = await requirePermission("portfolio:create");
  if ("response" in guard) return guard.response;

  const parsed = CreatePortfolioSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  try {
    const portfolio = await createPortfolio(guard.ctx, parsed.data);
    return NextResponse.json({ portfolio: { id: portfolio.id, name: portfolio.name } }, { status: 201 });
  } catch (e) {
    if (e instanceof PortfolioError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

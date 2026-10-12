import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { canWriteProject } from "@/lib/access";
import { CheckInError } from "@/server/checkins";
import { draftFromMarkets } from "@/server/market-rollup";

// POST /api/projects/[id]/checkin/from-markets — compose the product's weekly line from
// this week's market check-ins (worst RAG, one clause per market) and save it as the
// draft; when the week is already sent, hand the composition back for Edit & resend.
// PM-level, like Save draft.
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;
  if (!(await canWriteProject(ctx, id))) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Drafting the line is PM-level." } }, { status: 403 });
  try {
    const result = await draftFromMarkets(ctx, id);
    return NextResponse.json({ data: { ...result, view: result.view ? { ...result.view, canConfirm: true } : null } });
  } catch (e) {
    if (e instanceof CheckInError) return NextResponse.json({ error: { code: "NO_MARKET_CHECKINS", message: e.message } }, { status: 409 });
    throw e;
  }
}

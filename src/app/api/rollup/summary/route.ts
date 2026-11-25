import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { RollupError } from "@/server/portfolio-reports";
import { generateRollupSummary } from "@/server/rollup-summary";
import { auth } from "@/lib/auth";

// POST /api/rollup/summary { week? } — plan Phase 4: draft the Head's managerial summary for
// the week's roll-up. Returns text only; nothing is saved until the Head approves the line.
export const dynamic = "force-dynamic";

const Body = z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/).optional() });

export async function POST(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick a valid week." } }, { status: 400 });
  try {
    const session = await auth();
    const tenantName = session?.user?.tenantName ?? "the organisation";
    return NextResponse.json({ data: await generateRollupSummary(guard.ctx, { week: parsed.data.week, tenantName }) });
  } catch (e) {
    if (e instanceof RollupError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
    throw e;
  }
}

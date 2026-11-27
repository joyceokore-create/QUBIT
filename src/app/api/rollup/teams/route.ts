import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { isoWeekId } from "@/lib/iso-week";
import { postRollupToTeams } from "@/server/integrations/teams";
import { fail } from "@/app/api/configs/integrations/youtrack/_http";

// POST /api/rollup/teams { week? } — the Head posts the week's approved roll-up (its
// managerial summary) to the tenant's Teams channel again. Approval already posts it once.
export const dynamic = "force-dynamic";

const Body = z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/).optional() });

export async function POST(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick a valid week." } }, { status: 400 });
  try {
    const session = await auth();
    const out = await postRollupToTeams(guard.ctx, parsed.data.week ?? isoWeekId(new Date()), session?.user?.tenantName ?? "the organisation");
    return NextResponse.json({ data: out }, { status: out.posted ? 200 : 409 });
  } catch (e) {
    return fail(e);
  }
}

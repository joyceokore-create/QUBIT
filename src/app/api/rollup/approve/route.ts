import { NextResponse } from "next/server";
import { rollupNarrative } from "@/lib/workspace-schema";
import { validationError } from "@/server/errors";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { approveRollup, RollupError } from "@/server/portfolio-reports";

const Body = z.object({ narrative: rollupNarrative, acknowledgeUnsent: z.boolean().optional() });

// M-P3b — the approve step the Head queue has been honestly deferring since M-W1b.
export async function POST(req: Request) {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return validationError(parsed.error);
  }
  try {
    return NextResponse.json({ data: await approveRollup(guard.ctx, parsed.data.narrative, new Date(), { acknowledgeUnsent: parsed.data.acknowledgeUnsent }) }, { status: 201 });
  } catch (e) {
    if (e instanceof RollupError) {
      const status = e.code === "FORBIDDEN" ? 403 : 409;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

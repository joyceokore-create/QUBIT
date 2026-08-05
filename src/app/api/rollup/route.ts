import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { buildRollup, getRollup, RollupError } from "@/server/portfolio-reports";

// M-P3b (docs/34) — the Head's weekly roll-up. GET: current view (reports:read — execs
// may read); POST: (re)build the Draft — Head-only, asserted in the engine.
export async function GET() {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await getRollup(guard.ctx) });
}

export async function POST() {
  const guard = await requirePermission("reports:read");
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await buildRollup(guard.ctx) }, { status: 201 });
  } catch (e) {
    if (e instanceof RollupError) {
      const status = e.code === "FORBIDDEN" ? 403 : 409;
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status });
    }
    throw e;
  }
}

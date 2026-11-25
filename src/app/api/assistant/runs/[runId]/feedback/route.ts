import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { rateRun } from "@/server/connectors/lumi";
import { NO_STORE, withAssistant } from "@/server/assistant/panel";

// POST /api/assistant/runs/{runId}/feedback { rating, comment? } — thumbs up or down on an answer.
export const dynamic = "force-dynamic";

const Body = z.object({ rating: z.enum(["up", "down"]), comment: z.string().trim().max(2000).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { runId } = await params;
  if (!/^run_[A-Za-z0-9]+$/.test(runId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Unknown run." } }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Pick up or down." } }, { status: 400 });
  return withAssistant(guard.ctx, async (s) => NextResponse.json({ data: await rateRun(s.conn, s.sessionToken, runId, parsed.data) }, { headers: NO_STORE }));
}

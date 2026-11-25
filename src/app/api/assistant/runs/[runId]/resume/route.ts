import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { resumeRunStream } from "@/server/connectors/lumi";
import { sseResponse, withAssistant } from "@/server/assistant/panel";

// POST /api/assistant/runs/{runId}/resume { pendingId, approve? | answer?, note? } — the
// person's decision on a change Lumi proposed, or their answer to its question; streamed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z
  .object({ pendingId: z.string().regex(/^pend_[A-Za-z0-9]+$/), approve: z.boolean().optional(), answer: z.string().trim().min(1).max(20_000).optional(), note: z.string().trim().max(2000).optional() })
  .refine((v) => (v.approve === undefined) !== (v.answer === undefined), { message: "Send an approval or an answer." });

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { runId } = await params;
  if (!/^run_[A-Za-z0-9]+$/.test(runId)) return NextResponse.json({ error: { code: "VALIDATION", message: "Unknown run." } }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Check the answer." } }, { status: 400 });
  const { pendingId, ...rest } = parsed.data;
  return withAssistant(guard.ctx, async (s) => sseResponse(await resumeRunStream(s.conn, s.sessionToken, runId, { pending_id: pendingId, ...rest }, req.signal)));
}

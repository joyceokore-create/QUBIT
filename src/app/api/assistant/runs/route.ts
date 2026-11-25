import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-guard";
import { startRunStream } from "@/server/connectors/lumi";
import { sseResponse, withAssistant } from "@/server/assistant/panel";

// POST /api/assistant/runs { message, conversationId? } — one turn with Lumi as the person,
// streamed back as Lumi's server-sent events (plan Phase 5).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({ message: z.string().trim().min(1).max(20_000), conversationId: z.string().regex(/^conv_[A-Za-z0-9]+$/).optional() });

export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Type a message." } }, { status: 400 });
  return withAssistant(guard.ctx, async (s) =>
    sseResponse(await startRunStream(s.conn, s.sessionToken, { message: parsed.data.message, ...(parsed.data.conversationId ? { conversation_id: parsed.data.conversationId } : {}) }, req.signal)),
  );
}

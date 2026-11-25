import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { listConversations } from "@/server/connectors/lumi";
import { NO_STORE, withAssistant } from "@/server/assistant/panel";

// GET /api/assistant/conversations[?cursor] — the person's past chats with the assistant.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const cursor = new URL(req.url).searchParams.get("cursor") ?? undefined;
  return withAssistant(guard.ctx, async (s) => NextResponse.json({ data: await listConversations(s.conn, s.sessionToken, cursor) }, { headers: NO_STORE }));
}

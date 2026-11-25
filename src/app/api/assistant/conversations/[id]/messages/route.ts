import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { listMessages } from "@/server/connectors/lumi";
import { NO_STORE, withAssistant } from "@/server/assistant/panel";

// GET /api/assistant/conversations/{id}/messages[?cursor] — one chat's transcript, oldest first.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!/^conv_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: { code: "VALIDATION", message: "Unknown conversation." } }, { status: 400 });
  const cursor = new URL(req.url).searchParams.get("cursor") ?? undefined;
  return withAssistant(guard.ctx, async (s) => NextResponse.json({ data: await listMessages(s.conn, s.sessionToken, id, cursor) }, { headers: NO_STORE }));
}

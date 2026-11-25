import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { endAssistantForUser } from "@/server/assistant/sessions";

// DELETE /api/assistant/session — end the person's assistant sessions now (plan Phase 5):
// Lumi's sessions are ended and every delegation token is revoked. Sign-out does the same.
export const dynamic = "force-dynamic";

export async function DELETE() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: { ended: await endAssistantForUser(guard.ctx) } });
}

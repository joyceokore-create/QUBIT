import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { assistantProvider } from "@/server/assistant/sessions";

// GET /api/assistant/status — which engine Ask Q uses right now: "lumi" or "local" (plan Phase 5).
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: { provider: await assistantProvider(guard.ctx) } }, { headers: { "cache-control": "no-store" } });
}

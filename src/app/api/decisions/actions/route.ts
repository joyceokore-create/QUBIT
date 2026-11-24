import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { GlcCreateInput } from "@/lib/decisions";
import { createGlcAction } from "@/server/decision-requests";
import { engineError, invalid } from "../_respond";

// WS2 — add a GLC (Group-level committee) action. Executives and Heads; asserted in the engine.
export async function POST(req: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const parsed = GlcCreateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  try {
    return NextResponse.json({ data: await createGlcAction(guard.ctx, parsed.data) }, { status: 201 });
  } catch (e) {
    return engineError(e);
  }
}

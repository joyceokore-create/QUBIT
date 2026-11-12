import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { completeGlcAction } from "@/server/decision-requests";
import { engineError, isId } from "../../../_respond";

// WS2 — "Mark Done" on a GLC action: its owner, an Executive or a Head (asserted in the engine).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Action not found." } }, { status: 404 });
  try {
    return NextResponse.json({ data: await completeGlcAction(guard.ctx, id) });
  } catch (e) {
    return engineError(e);
  }
}

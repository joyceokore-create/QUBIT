import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { DecideInput } from "@/lib/decisions";
import { decideRequest } from "@/server/decision-requests";
import { engineError, invalid, isId } from "../../_respond";

// WS2 — drawer 15 "Record a Decision": approve, decline (note required) or defer (new due
// date + note). Executives only — asserted in the engine, which also writes the Register
// Decision, the audit row and the notifications in one transaction.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Decision not found." } }, { status: 404 });
  const parsed = DecideInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error);
  try {
    return NextResponse.json({ data: await decideRequest(guard.ctx, id, parsed.data) });
  } catch (e) {
    return engineError(e);
  }
}

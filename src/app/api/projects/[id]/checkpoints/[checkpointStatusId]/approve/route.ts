import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { approveGate, ApproveInput } from "@/server/gate-approval";
import { gateErrorResponse, validId, type GateParams } from "../respond";

// POST /api/projects/:id/checkpoints/:checkpointStatusId/approve — WS1 sign-off. Body:
// { exception?: boolean, note?: string }. The ENGINE decides who may approve (Head / Super
// Admin any gate, Head of QA testing gates, Executives never), enforces four-eyes and the
// exception rule, sets state = Done, runs the cascade and audits gate.approve(_exception).
export async function POST(req: Request, { params }: GateParams) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id, checkpointStatusId } = await params;
  if (!validId(id) || !validId(checkpointStatusId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gate not found." } }, { status: 404 });
  const body = ApproveInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: body.error.issues[0]?.message ?? "Invalid input." } }, { status: 400 });
  try {
    return NextResponse.json(await approveGate(guard.ctx, id, checkpointStatusId, body.data));
  } catch (e) {
    return gateErrorResponse(e);
  }
}

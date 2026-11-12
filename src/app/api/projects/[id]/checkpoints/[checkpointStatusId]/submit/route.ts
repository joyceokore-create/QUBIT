import { NextResponse } from "next/server";
import { requireSession, forbidden } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { submitGate, SubmitInput } from "@/server/gate-approval";
import { gateErrorResponse, validId, type GateParams } from "../respond";

// POST /api/projects/:id/checkpoints/:checkpointStatusId/submit — WS1: the project's PM/lead
// (canWriteProject) asks for sign-off on a sign-off gate. Audited as gate.submit; the approvers
// for the gate's kind are notified.
export async function POST(req: Request, { params }: GateParams) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id, checkpointStatusId } = await params;
  if (!validId(id) || !validId(checkpointStatusId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gate not found." } }, { status: 404 });
  const body = SubmitInput.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  if (!(await canWriteProject(guard.ctx, id))) return forbidden("Only the project's PM or lead submits a gate for sign-off.");
  try {
    return NextResponse.json(await submitGate(guard.ctx, id, checkpointStatusId));
  } catch (e) {
    return gateErrorResponse(e);
  }
}

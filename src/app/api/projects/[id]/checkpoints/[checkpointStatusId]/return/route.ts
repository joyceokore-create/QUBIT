import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { validationError } from "@/server/errors";
import { returnGate, ReturnInput } from "@/server/gate-approval";
import { gateErrorResponse, validId, type GateParams } from "../respond";

// POST /api/projects/:id/checkpoints/:checkpointStatusId/return — WS1: send a submitted gate
// back to the PM. Body: { note } (required, 5–500 chars). Approver scope and four-eyes are
// enforced in the engine; audited as gate.return; the PM and submitter are notified.
export async function POST(req: Request, { params }: GateParams) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  const { id, checkpointStatusId } = await params;
  if (!validId(id) || !validId(checkpointStatusId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gate not found." } }, { status: 404 });
  const body = ReturnInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return validationError(body.error);
  try {
    return NextResponse.json(await returnGate(guard.ctx, id, checkpointStatusId, body.data));
  } catch (e) {
    return gateErrorResponse(e);
  }
}

import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { approverScope } from "@/lib/gate-approval";
import { getGateReview } from "@/server/gate-approval";
import { gateErrorResponse, validId, type GateParams } from "./respond";

// GET /api/projects/:id/checkpoints/:checkpointStatusId — WS1 review drawer data (checklist,
// evidence, open critical issues for a testing gate, who submitted / decided). Readable by the
// project's PM/lead and by approvers (Head / Head of QA / Super Admin); `item.canDecide` says
// whether the viewer may act on it.
export async function GET(_req: Request, { params }: GateParams) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id, checkpointStatusId } = await params;
  if (!validId(id) || !validId(checkpointStatusId)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gate not found." } }, { status: 404 });
  if (approverScope(guard.ctx.roles) === "none" && !(await canWriteProject(guard.ctx, id))) return forbidden();
  try {
    return NextResponse.json(await getGateReview(guard.ctx, id, checkpointStatusId));
  } catch (e) {
    return gateErrorResponse(e);
  }
}

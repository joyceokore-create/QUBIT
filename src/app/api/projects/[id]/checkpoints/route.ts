import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { gateWriteScope } from "@/lib/testing-gates";
import { getTenantContext } from "@/lib/tenant";
import {
  CheckpointError,
  checkpointIsTesting,
  SetCheckpointStateInput,
  getProjectCheckpoints,
  listCheckpointTemplates,
  setCheckpointState,
  setProjectTemplate,
} from "@/server/checkpoints";

// GET   /api/projects/:id/checkpoints — the project's gate matrix + template options
// PATCH /api/projects/:id/checkpoints — set one gate's state, or swap the template
//
// Checkpoint state is a governance fact (docs/18 §7), so it rides the SAME gate as
// stage/priority/status note: the project's PM/lead, or a holder of project:stage.

const STATUS: Record<CheckpointError["code"], number> = {
  NOT_FOUND: 404,
  BLOCKER_REQUIRED: 400,
  TEMPLATE_MISMATCH: 400,
  // 409: the request is well-formed, the gate simply isn't satisfied yet. The response
  // carries the unmet requirements so the UI can list them and offer an override.
  GATE_UNMET: 409,
};

// docs/38 — ?orgUnitId= scopes the matrix to one instance's gates, ?moduleId= to one
// module's own gates (both: that module in that instance). PATCH carries the same scope.
const Scope = z.object({ orgUnitId: z.string().uuid().nullable().optional(), moduleId: z.string().min(1).nullable().optional(), allMarkets: z.boolean().optional() });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const url = new URL(req.url);
  const scope = Scope.safeParse({ orgUnitId: url.searchParams.get("orgUnitId") || null, moduleId: url.searchParams.get("moduleId") || null });
  const [checkpoints, templates] = await Promise.all([
    getProjectCheckpoints(guard.ctx, id, scope.success ? scope.data : undefined),
    listCheckpointTemplates(guard.ctx),
  ]);
  const runs = await canWriteProject(guard.ctx, id);
  return NextResponse.json({
    ...checkpoints,
    templates,
    // D10: Executives set no gates (UX10); Head of QA sets testing gates only (UX9).
    canGovern: (can(guard.ctx, "project:stage") || runs) && gateWriteScope(guard.ctx.roles, runs) !== "none",
    testingOnly: gateWriteScope(guard.ctx.roles, runs) === "testing",
  });
}

const PatchBody = z.union([
  SetCheckpointStateInput.merge(Scope),
  z.object({ templateId: z.string().min(1).nullable() }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  const runs = await canWriteProject(ctx, id);
  const allowed = can(ctx, "project:stage") || runs;
  if (!allowed) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  // D10: an Executive (without a full-gate role, not running this project) sets no gates —
  // they act through Decisions (UX10). A Head of QA sets testing gates only — SIT/UAT entry
  // and exit — and may not swap the project's template (UX9).
  const scope = gateWriteScope(ctx.roles, runs);
  if (scope === "none") {
    return NextResponse.json(
      { error: { code: "GATES_NOT_ALLOWED", message: "Executives don't set gates; the project's PM or a Head does." } },
      { status: 403 },
    );
  }
  if (scope === "testing") {
    const testing = "templateId" in parsed.data ? false : await checkpointIsTesting(ctx, parsed.data.checkpointId);
    if (testing === null) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Gate not found." } }, { status: 404 });
    if (!testing) {
      return NextResponse.json(
        { error: { code: "TESTING_GATES_ONLY", message: "Head of QA can set testing gates (SIT and UAT) only." } },
        { status: 403 },
      );
    }
  }

  try {
    const data =
      "templateId" in parsed.data
        ? await setProjectTemplate(ctx, id, parsed.data.templateId)
        : await setCheckpointState(ctx, id, parsed.data, { orgUnitId: parsed.data.orgUnitId ?? null, moduleId: parsed.data.moduleId ?? null, allMarkets: parsed.data.allMarkets === true });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof CheckpointError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message, unmet: e.unmet ?? undefined } },
        { status: STATUS[e.code] },
      );
    }
    throw e;
  }
}

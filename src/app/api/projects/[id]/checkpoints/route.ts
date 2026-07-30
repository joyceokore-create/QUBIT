import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { getTenantContext } from "@/lib/tenant";
import {
  CheckpointError,
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const [checkpoints, templates] = await Promise.all([
    getProjectCheckpoints(guard.ctx, id),
    listCheckpointTemplates(guard.ctx),
  ]);
  return NextResponse.json({
    ...checkpoints,
    templates,
    canGovern: can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)),
  });
}

const PatchBody = z.union([
  SetCheckpointStateInput,
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
  const allowed = can(ctx, "project:stage") || (await canWriteProject(ctx, id));
  if (!allowed) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });

  try {
    const data =
      "templateId" in parsed.data
        ? await setProjectTemplate(ctx, id, parsed.data.templateId)
        : await setCheckpointState(ctx, id, parsed.data);
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

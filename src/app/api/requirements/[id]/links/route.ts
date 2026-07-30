import { NextResponse } from "next/server";
import { getTenantContext, withTenant } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { canWriteProject } from "@/lib/access";
import { LinkTaskInput, RequirementError, setRequirementTaskLink } from "@/server/requirements";

// PUT /api/requirements/:id/links — link or unlink a task as covering this requirement
// (docs/16 §6 traceability). Same governance gate as the project's other status facts.

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;

  const projectId = await withTenant(ctx, (tx) =>
    tx.requirement.findUnique({ where: { id }, select: { projectId: true } }).then((r) => r?.projectId ?? null),
  );
  if (!projectId) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (!(can(ctx, "project:stage") || (await canWriteProject(ctx, projectId)))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  const parsed = LinkTaskInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input." } }, { status: 400 });
  }
  try {
    await setRequirementTaskLink(ctx, id, parsed.data.taskId, parsed.data.linked);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RequirementError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.code === "NOT_FOUND" ? 404 : 400 },
      );
    }
    throw e;
  }
}

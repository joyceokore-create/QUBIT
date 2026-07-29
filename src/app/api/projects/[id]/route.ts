import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { canContributeToProject, canWriteProject } from "@/lib/access";
import { getTenantContext, withTenant } from "@/lib/tenant";
import { getProjectPanelData, updateProject, UpdateProjectInput } from "@/server/projects";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const project = await getProjectPanelData(guard.ctx, id);
  if (!project) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Project not found." } },
      { status: 404 },
    );
  }
  const isMember = await withTenant(guard.ctx, async (tx) => {
    const [lead, m] = await Promise.all([
      tx.project.findFirst({ where: { id, leadUserId: guard.ctx.userId }, select: { id: true } }),
      tx.projectMember.findFirst({ where: { projectId: id, userId: guard.ctx.userId }, select: { id: true } }),
    ]);
    return Boolean(lead || m);
  });
  return NextResponse.json({
    ...project,
    canEdit: can(guard.ctx, "project:update"), // project settings / team
    canContribute: await canContributeToProject(guard.ctx, id), // tasks + blockers
    // docs/18 §7 — governance fields (stage / priority / status note)
    canGovern: can(guard.ctx, "project:stage") || (await canWriteProject(guard.ctx, id)),
    isMember,
  });
}

const GOVERNANCE_FIELDS = new Set(["pipelineStage", "priority", "statusNote", "portfolioId"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const { id } = await params;

  const parsed = UpdateProjectInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  // docs/18 §7: governance-only edits (stage / priority / status note) are open to the
  // project's PM/lead (resource-scoped) OR holders of project:stage (heads, execs).
  // Anything wider keeps the transitional project:update gate (DM1.4).
  const touched = Object.keys(parsed.data).filter((k) => parsed.data[k as keyof typeof parsed.data] !== undefined);
  const governanceOnly = touched.length > 0 && touched.every((k) => GOVERNANCE_FIELDS.has(k));
  const allowed = governanceOnly
    ? can(ctx, "project:stage") || (await canWriteProject(ctx, id))
    : can(ctx, "project:update");
  if (!allowed) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }

  await updateProject(ctx, id, parsed.data);
  return NextResponse.json({ ok: true });
}

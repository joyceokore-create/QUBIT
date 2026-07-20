import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { can } from "@/lib/rbac";
import { canContributeToProject } from "@/lib/access";
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
  return NextResponse.json({
    ...project,
    canEdit: can(guard.ctx, "project:update"), // project settings / team
    canContribute: await canContributeToProject(guard.ctx, id), // tasks + blockers
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  const parsed = UpdateProjectInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid input." } },
      { status: 400 },
    );
  }

  await updateProject(guard.ctx, id, parsed.data);
  return NextResponse.json({ ok: true });
}

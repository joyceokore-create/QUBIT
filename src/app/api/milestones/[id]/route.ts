import { NextResponse } from "next/server";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { updateMilestone, deleteMilestone, milestoneProjectId, UpdateMilestoneInput, MilestoneError } from "@/server/milestones";

type Ctx = { params: Promise<{ id: string }> };

// UX7: `project:update` is a coarse role key (every PM holds it), so on its own it let a PM
// edit or delete milestones on projects they don't run. Writes now also need the per-project
// check every other project write uses (canWriteProject: lead / PM member / Heads / Super Admin).
async function guardWrite(id: string) {
  const guard = await requirePermission("project:update");
  if ("response" in guard) return guard;
  const projectId = await milestoneProjectId(guard.ctx, id);
  if (!projectId) return { response: NextResponse.json({ error: { code: "NOT_FOUND", message: "Milestone not found." } }, { status: 404 }) };
  if (!(await canWriteProject(guard.ctx, projectId))) return { response: forbidden("Only the project's PM can change its milestones.") };
  return guard;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardWrite(id);
  if ("response" in guard) return guard.response;
  const parsed = UpdateMilestoneInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid update." } }, { status: 400 });
  }
  try {
    await updateMilestone(guard.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MilestoneError) return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 404 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardWrite(id);
  if ("response" in guard) return guard.response;
  await deleteMilestone(guard.ctx, id);
  return NextResponse.json({ ok: true });
}

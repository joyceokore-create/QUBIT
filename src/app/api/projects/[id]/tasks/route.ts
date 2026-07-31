import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canContributeToProject } from "@/lib/access";
import { listProjectTasks, getProjectProgress, addTasks, TaskInput, TaskError } from "@/server/project-tasks";
import { isYoutrackConnected } from "@/server/connectors/youtrack-sync";
import { viewerBoardCategory } from "@/server/board-scope";
import { taskVisibleTo } from "@/lib/board-lens";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const [tasks, progress, mirrored, viewerCategory] = await Promise.all([
    listProjectTasks(guard.ctx, id),
    getProjectProgress(guard.ctx, id),
    // M7-C: the board hides its own add/generate controls when YouTrack owns this project's
    // work, so the refusal never has to be discovered by trying.
    isYoutrackConnected(guard.ctx, id),
    viewerBoardCategory(guard.ctx, id),
  ]);
  // DM1.43 — visibility is enforced HERE, not in the component: a discipline member
  // (Dev/QA/Implementor) receives only their lane plus anything assigned to them; PMs and
  // stakeholders receive everything. Progress stays WHOLE-project on purpose — a dev who
  // sees 2 cards still sees the project at its real %, or every persona would carry a
  // different "project progress" and the single health engine would mean nothing.
  const visible = tasks.filter((t) => taskVisibleTo(viewerCategory, guard.ctx.userId, t));
  return NextResponse.json({ tasks: visible, progress, mirrored, viewerCategory });
}

const PostBody = z.object({ tasks: z.array(TaskInput).min(1), draft: z.boolean().optional() });

export async function POST(req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canContributeToProject(guard.ctx, id))) {
    return forbidden("You can only add tasks to a project you're part of.");
  }
  const parsed = PostBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid tasks." } }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await addTasks(guard.ctx, id, parsed.data.tasks, {
        approvalStatus: parsed.data.draft ? "Draft" : "Published",
        reporterId: guard.ctx.userId, // who filed it (QA authorship on bugs, Phase 6.1)
      }),
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

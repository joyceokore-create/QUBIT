import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canContributeToProject } from "@/lib/access";
import { listProjectTasks, getProjectProgress, addTasks, TaskInput, TaskError } from "@/server/project-tasks";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const [tasks, progress] = await Promise.all([
    listProjectTasks(guard.ctx, id),
    getProjectProgress(guard.ctx, id),
  ]);
  return NextResponse.json({ tasks, progress });
}

const PostBody = z.object({ tasks: z.array(TaskInput).min(1) });

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
    return NextResponse.json(await addTasks(guard.ctx, id, parsed.data.tasks), { status: 201 });
  } catch (e) {
    if (e instanceof TaskError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: 400 });
    }
    throw e;
  }
}

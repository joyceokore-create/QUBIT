import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { canContributeToProject } from "@/lib/access";
import { AddLessonInput, addLesson, listLessons } from "@/server/lessons";

// GET/POST /api/projects/:id/lessons — lessons learned (docs/16 §6). Reading follows
// project read; writing needs project membership, because the people who lived the work
// are the ones who know the lesson.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  return NextResponse.json({
    data: await listLessons(guard.ctx, id),
    canAdd: await canContributeToProject(guard.ctx, id),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;

  if (!(await canContributeToProject(guard.ctx, id))) {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = AddLessonInput.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid input." } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: await addLesson(guard.ctx, id, parsed.data) });
}

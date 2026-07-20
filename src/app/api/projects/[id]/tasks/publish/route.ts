import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canContributeToProject } from "@/lib/access";
import { publishProjectDrafts } from "@/server/project-tasks";

const Body = z.object({ taskIds: z.array(z.string()).optional() });

// Approve a plan: publish a project's Draft tasks (§2.2). Any member of the project may approve.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canContributeToProject(guard.ctx, id))) {
    return forbidden("You can only approve tasks on a project you're part of.");
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const taskIds = parsed.success ? parsed.data.taskIds : undefined;
  return NextResponse.json(await publishProjectDrafts(guard.ctx, id, taskIds));
}

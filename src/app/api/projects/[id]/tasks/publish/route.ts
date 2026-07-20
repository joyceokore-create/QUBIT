import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, forbidden } from "@/lib/api-guard";
import { canWriteProject } from "@/lib/access";
import { publishProjectDrafts } from "@/server/project-tasks";

const Body = z.object({ taskIds: z.array(z.string()).optional() });

// Approve a plan: publish a project's Draft tasks (§2.2). Publishing is PM-level
// (lead / PM-member / heads / SuperAdmin) — DM1.15 №3 tightened DM1.14's any-member
// rule: any member still GENERATES plans; only the PM publishes them.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  const { id } = await params;
  if (!(await canWriteProject(guard.ctx, id))) {
    return forbidden("Only the project's manager (lead/PM) can publish a plan.");
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const taskIds = parsed.success ? parsed.data.taskIds : undefined;
  return NextResponse.json(await publishProjectDrafts(guard.ctx, id, taskIds));
}

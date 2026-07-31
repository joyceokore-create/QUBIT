import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-guard";
import { listMyTasks } from "@/server/project-tasks";

// GET /api/board — the personal board's data (docs/18 §4): everything assigned to me,
// with "added by" attribution. The client refetches on task SSE events.

export async function GET() {
  const guard = await requirePermission("dashboard:read");
  if ("response" in guard) return guard.response;
  const tasks = await listMyTasks(guard.ctx, guard.ctx.userId);
  return NextResponse.json({
    data: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectCode: t.projectCode,
      projectName: t.projectName,
      status: t.status,
      type: t.type,
      blocked: t.blocked,
      blockedReason: t.blockedReason,
      addedBy: t.addedBy,
      // M7-C: a mirrored issue is read-only here and links out to YouTrack.
      sourceSystem: t.sourceSystem,
      externalKey: t.externalKey,
      externalUrl: t.externalUrl,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
}

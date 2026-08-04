import { NextResponse } from "next/server";
import { requirePermission, tasksAreMirrored } from "@/lib/api-guard";
import { listProjectTasks, getProjectProgress } from "@/server/project-tasks";
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

// M-P2a (docs/33 §2, docs/25 §1) — creating tasks in QUBIT is retired for every role:
// work items are raised in YouTrack and mirrored here at the next sync.
export async function POST(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  await params;
  return tasksAreMirrored();
}

import { requirePermission, tasksAreMirrored } from "@/lib/api-guard";

type Ctx = { params: Promise<{ id: string }> };

// M-P2a (docs/33 §2, docs/25 §1) — human task authoring is RETIRED: tasks live in
// YouTrack and QUBIT mirrors them read-only. Edits and deletes answer 403
// TASKS_ARE_MIRRORED for every role, PMs included. System writers (the YouTrack sync,
// the M7-B commit webhook) never used this route — they call the engine directly, so
// nothing automated broke when this closed. Blockers keep their own route
// (/api/tasks/[id]/block): flagging stuck work is RAID, not task authoring.

export async function PATCH(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  await params;
  return tasksAreMirrored();
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requirePermission("task:read");
  if ("response" in guard) return guard.response;
  await params;
  return tasksAreMirrored();
}

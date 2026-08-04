import { requirePermission, tasksAreMirrored } from "@/lib/api-guard";

// M-P2a (docs/33 §2) — the draft-publish approval flow was task AUTHORING and is retired
// with it (docs/25 §1: nobody authors tasks in QUBIT). Legacy Draft cards remain visible
// on the board with their pill; they graduate or die in YouTrack terms now.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  await params;
  return tasksAreMirrored();
}

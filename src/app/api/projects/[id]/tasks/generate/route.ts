import { requirePermission, tasksAreMirrored } from "@/lib/api-guard";

// M-P2a (docs/33 §2) — AI plan generation CREATED tasks, so it retires with authoring
// (docs/25 §1). Document ingest lives on in M8-C requirement extraction — requirements
// are QUBIT's to keep; tasks are YouTrack's.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission("project:read");
  if ("response" in guard) return guard.response;
  await params;
  return tasksAreMirrored();
}

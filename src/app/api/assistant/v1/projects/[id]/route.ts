import { getProjectPanelData } from "@/server/projects";
import { getCurrentCheckIn } from "@/server/checkins";
import { AssistantError, assistantRoute } from "@/server/assistant/route";

// GET /api/assistant/v1/projects/{id} — getProject (plan Phase 5).
export const dynamic = "force-dynamic";

export const GET = assistantRoute<{ id: string }>({ permission: "project:read" }, async (ctx, _req, { id }) => {
  const p = await getProjectPanelData(ctx, id);
  if (!p) throw new AssistantError("No such project.", 404);
  const ci = await getCurrentCheckIn(ctx, id);
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.status,
    priority: p.priority,
    stage: p.pipelineStage,
    statusNote: p.statusNote,
    avgProgress: p.avgProgress,
    dueDate: p.dueDate,
    budget: p.budget,
    description: p.description,
    objective: p.objective,
    checkIn: { week: ci.isoWeek, status: ci.status, rag: ci.effectiveRag, computedRag: ci.computedRag, narrative: ci.narrative },
  };
});

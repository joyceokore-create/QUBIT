import { z } from "zod";
import { canWriteProject } from "@/lib/access";
import { getCurrentCheckIn, RAGS, saveCheckInDraft } from "@/server/checkins";
import { AssistantError, assistantRoute, isDryRun, readBody } from "@/server/assistant/route";

// POST /api/assistant/v1/projects/{id}/checkin-draft[?dryRun=1] — saveCheckInDraft: a DRAFT
// only, PM-level (canWriteProject), the same gate as the Weekly Update. The PM still sends it.
export const dynamic = "force-dynamic";

const Draft = z
  .object({ narrative: z.string().trim().min(1).max(500), ragOverride: z.enum(RAGS).optional(), overrideReason: z.string().trim().min(5).max(300).optional() })
  .refine((v) => !v.ragOverride || v.overrideReason, { path: ["overrideReason"], message: "Say why the RAG differs from QUBIT's." });

export const POST = assistantRoute<{ id: string }>({ permission: "project:read" }, async (ctx, req, { id }) => {
  const input = await readBody(req, Draft);
  if (!(await canWriteProject(ctx, id))) throw new AssistantError("Saving a check-in draft is for the project's PM.", 403);
  const current = await getCurrentCheckIn(ctx, id);
  if (current.status === "Confirmed") throw new AssistantError("This week's check-in was already sent.", 409);
  if (isDryRun(req)) return { dryRun: true, week: current.isoWeek, current: { narrative: current.narrative, rag: current.effectiveRag }, wouldSave: input };
  const v = await saveCheckInDraft(ctx, id, input);
  return { week: v.isoWeek, status: v.status, narrative: v.narrative, rag: v.effectiveRag };
});

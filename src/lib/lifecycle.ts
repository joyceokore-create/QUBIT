/**
 * UX10 (UX plan D8a/D8b) — a project's lifecycle stage, one rule everywhere (Portfolios cards,
 * the nightly snapshot, stage-entry dates). Intake is the Idea table, not a project stage.
 *   Live      = delivery status Completed
 *   Inactive  = Cancelled, paused (pipeline stage or priority "Paused"), or in a portfolio whose
 *               category is "Shelved"
 *   otherwise = the pipeline stage: Exploring · Evaluating · Approved
 * Pure and client-safe.
 */
export const LIFECYCLE_STAGES = ["Exploring", "Evaluating", "Approved", "Live", "Inactive"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

type StageInput = { status: string; pipelineStage: string; priority?: string | null; portfolioCategory?: string | null };

export function lifecycleStage(p: StageInput): LifecycleStage {
  if (p.status === "Completed") return "Live";
  if (p.status === "Cancelled" || p.pipelineStage === "Paused" || p.priority === "Paused" || p.portfolioCategory === "Shelved") return "Inactive";
  if (p.pipelineStage === "Evaluating") return "Evaluating";
  if (p.pipelineStage === "Approved") return "Approved";
  return "Exploring";
}

/** Why an inactive project is inactive, in a word. */
export function inactiveReason(p: StageInput): "Cancelled" | "Paused" | "Shelved" | null {
  if (p.status === "Completed") return null;
  if (p.status === "Cancelled") return "Cancelled";
  if (p.pipelineStage === "Paused" || p.priority === "Paused") return "Paused";
  if (p.portfolioCategory === "Shelved") return "Shelved";
  return null;
}

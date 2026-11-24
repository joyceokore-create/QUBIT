/**
 * The visible words for health and lifecycle (UX plan D8a). Pure and client-safe.
 * Health: On track / At risk / Off track replace Green / Amber / Red as the label —
 * colour is never the only signal (U4). Stages keep their names; their colours are
 * the --stage-* tokens, and amber/red/green stay reserved for health.
 */
export type HealthKey = "ok" | "warn" | "bad";

const HEALTH_FROM: Record<string, HealthKey> = {
  Green: "ok", G: "ok", OnTrack: "ok", "On track": "ok",
  Amber: "warn", A: "warn", AtRisk: "warn", "At risk": "warn",
  Red: "bad", R: "bad", Overdue: "bad", OffTrack: "bad", "Off track": "bad",
};

export const HEALTH_WORD: Record<HealthKey, string> = { ok: "On track", warn: "At risk", bad: "Off track" };

/** Any RAG-ish value (Green, "G", OnTrack, …) → its health key, or null when unknown/not rated. */
export function healthKey(value: string | null | undefined): HealthKey | null {
  return (value && HEALTH_FROM[value]) || null;
}

/** "Green" → "On track". Unknown or not rated → "Not rated". */
export function healthWord(value: string | null | undefined): string {
  const k = healthKey(value);
  return k ? HEALTH_WORD[k] : "Not rated";
}

export const STAGES = ["Intake", "Exploring", "Evaluating", "Approved", "Live"] as const;
export type Stage = (typeof STAGES)[number];

/** Stage → its colour token (D8a). Unknown stages read as Intake grey. */
export function stageToken(stage: string): string {
  switch (stage) {
    case "Exploring":
      return "--stage-exploring";
    case "Evaluating":
      return "--stage-evaluating";
    case "Approved":
      return "--stage-approved";
    case "Live":
      return "--stage-live";
    default:
      return "--stage-intake";
  }
}

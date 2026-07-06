export const SEVERITY_ORDER = ["Low", "Medium", "High", "Critical"] as const;
export type SeverityLevel = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_CLASSES: Record<SeverityLevel, string> = {
  Low: "bg-status-green-bg text-status-green",
  Medium: "bg-status-blue-bg text-status-blue",
  High: "bg-amber-bg text-amber",
  Critical: "bg-status-red-bg text-status-red",
};

// probability(1-5) x impact(1-5) -> score(1-25) -> bucket. Distinct from the project RAG
// status colors (same 4 tokens) since heat/severity only render inside the RAID screen.
export function heatBucket(probability: number, impact: number): SeverityLevel {
  const score = probability * impact;
  if (score <= 4) return "Low";
  if (score <= 9) return "Medium";
  if (score <= 15) return "High";
  return "Critical";
}

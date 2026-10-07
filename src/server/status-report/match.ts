/**
 * Status-report upload — match a parsed row's project name to the viewer's projects. Pure.
 * Exact (case/space-folded) → the name without its parenthetical ("Lumi (AI Knowledge
 * Layer)" → "Lumi") → the project code → token overlap as a *suggestion* the PM must
 * confirm. Nothing is ever applied on a suggestion alone.
 */

export interface MatchableProject {
  id: string;
  code: string;
  name: string;
}

export interface RowMatch {
  projectId: string | null;
  confidence: "exact" | "suggested" | "none";
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const stripParens = (s: string) => s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
const tokens = (s: string) => new Set(fold(s).split(" ").filter((t) => t.length > 2));

export function matchProject(rowName: string, projects: MatchableProject[]): RowMatch {
  const raw = fold(rowName);
  const bare = fold(stripParens(rowName));
  if (!raw) return { projectId: null, confidence: "none" };
  for (const p of projects) {
    const n = fold(p.name);
    if (n === raw || n === bare || fold(stripParens(p.name)) === bare) return { projectId: p.id, confidence: "exact" };
  }
  for (const p of projects) {
    if (fold(p.code) === raw || fold(p.code) === bare) return { projectId: p.id, confidence: "exact" };
  }
  // Suggestion: the best token overlap, only when it is clearly ahead of the runner-up.
  const rt = tokens(bare || raw);
  if (rt.size === 0) return { projectId: null, confidence: "none" };
  let best: { id: string; score: number } | null = null;
  let second = 0;
  for (const p of projects) {
    const pt = tokens(stripParens(p.name));
    if (pt.size === 0) continue;
    let common = 0;
    for (const t of rt) if (pt.has(t)) common++;
    const score = common / Math.max(rt.size, pt.size);
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { id: p.id, score };
    } else if (score > second) second = score;
  }
  if (best && best.score >= 0.6 && best.score > second) return { projectId: best.id, confidence: "suggested" };
  return { projectId: null, confidence: "none" };
}


/**
 * Which delivery gate a report's Stage cell names ("UAT / Pilot Readiness (VAPT in
 * progress)" → the UAT gate). Case-insensitive, whole-word, the longest gate name wins;
 * null when no gate is named — the stage then only becomes the status note.
 */
export function matchStageGate<T extends { name: string }>(stage: string, gates: T[]): T | null {
  const text = ` ${stage.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (!text.trim()) return null;
  let best: T | null = null;
  for (const g of gates) {
    const name = ` ${g.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
    if (name.trim() && text.includes(name) && (!best || name.length > best.name.length + 2)) best = g;
  }
  return best;
}

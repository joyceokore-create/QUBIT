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
  /** The product's live markets, so "Swipe Rwanda" can name a project AND a market. */
  markets?: { orgUnitId: string; code: string; name: string }[];
}

export interface RowMatch {
  projectId: string | null;
  confidence: "exact" | "suggested" | "none";
  /** The market the row's title names (a per-market one-pager), when the project has it. */
  orgUnitId?: string | null;
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
  // "Swipe Agent Banking Solution" names "Swipe Agent Banking": every word of the project's
  // name is in the row's, and the project has at least two words to its name.
  const rt = tokens(bare || raw);
  for (const p of projects) {
    const pt = tokens(stripParens(p.name));
    if (pt.size >= 2 && [...pt].every((w) => rt.has(w))) return { projectId: p.id, confidence: "exact" };
  }
  // Suggestion: the best token overlap, only when it is clearly ahead of the runner-up.
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
  // "Anchor Pario" → Anchor ERP, "KCB Safiri" → ZED-SAFIRI: half the words in common and
  // nothing else close is worth a "check" — the PM confirms before anything is written.
  if (best && best.score >= 0.5 && best.score > second) return { projectId: best.id, confidence: "suggested" };
  return { projectId: null, confidence: "none" };
}

/**
 * A per-market one-pager is titled "Swipe Rwanda" / "Swipe — Rwanda" / "Swipe in Rwanda":
 * when a project's market name or code ends (or starts) the title, the rest is matched as
 * the project. A plain title falls through to matchProject.
 */
export function matchProjectAndMarket(rowName: string, projects: MatchableProject[], hints: { code?: string | null; market?: string | null } = {}): RowMatch {
  // QUBIT's own template: the Code column is exact, the Market column names the market.
  if (hints.code) {
    const p = projects.find((x) => fold(x.code) === fold(hints.code!));
    if (p) {
      const mk = hints.market ? (p.markets ?? []).find((x) => fold(x.code) === fold(hints.market!) || fold(x.name) === fold(hints.market!)) : null;
      return { projectId: p.id, confidence: "exact", orgUnitId: mk?.orgUnitId ?? null };
    }
  }
  const f = fold(rowName);
  for (const p of projects) {
    for (const mk of p.markets ?? []) {
      for (const needle of [fold(mk.name), fold(mk.code)]) {
        if (!needle || needle === f) continue;
        const tail = new RegExp(`(?:^|\\s)(?:in\\s+)?${needle}$`);
        const head = new RegExp(`^${needle}(?:\\s|$)`);
        const rest = tail.test(f) ? f.replace(tail, "").trim() : head.test(f) ? f.replace(head, "").trim() : null;
        if (rest === null || !rest) continue;
        const m = matchProject(rest, [p]);
        if (m.projectId) return { ...m, orgUnitId: mk.orgUnitId };
        // "Swipe" alone against "Swipe Agent Banking": the first word is the product's.
        const first = fold(stripParens(p.name)).split(" ")[0];
        if (first && rest === first) return { projectId: p.id, confidence: "exact", orgUnitId: mk.orgUnitId };
      }
    }
  }
  const m = matchProject(rowName, projects);
  if (m.projectId && hints.market) {
    const p = projects.find((x) => x.id === m.projectId);
    const mk = (p?.markets ?? []).find((x) => fold(x.code) === fold(hints.market!) || fold(x.name) === fold(hints.market!));
    return { ...m, orgUnitId: mk?.orgUnitId ?? null };
  }
  return { ...m, orgUnitId: null };
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

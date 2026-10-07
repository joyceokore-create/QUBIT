import type { CheckpointState } from "@/server/checkpoints";
import type { InstanceState } from "@/server/project-instances";

/**
 * Status-report upload — turn what a one-pager SAYS about delivery into what QUBIT would
 * WRITE, against one project's delivery catalog: the "Where we are" stages become gate
 * states on the Product build track, a channels-by-market grid (or a per-market list)
 * becomes module states per market, and a market named in the title ("Swipe Rwanda")
 * scopes everything to that market. Pure and shared: the server resolves the first pass
 * for the matched project; the review dialog re-resolves when the PM picks another
 * project. Nothing here is applied on its own — every change is shown and ticked first.
 */

export interface CatalogMarket {
  orgUnitId: string;
  code: string;
  name: string;
  flag: string | null;
}
export interface CatalogModule {
  id: string;
  name: string;
  code: string;
  kind: "instance" | "module";
}
export interface CatalogGate {
  checkpointId: string;
  name: string;
  orderIndex: number;
}
export interface DeliveryCatalog {
  projectId: string;
  code: string;
  name: string;
  /** What this product calls its modules ("Agent channels"). */
  moduleLabel: string;
  templateName: string | null;
  markets: CatalogMarket[];
  modules: CatalogModule[];
  gates: CatalogGate[];
  /** Product track (orgUnitId null) and every market's own copy of it. */
  gateStates: { orgUnitId: string | null; checkpointId: string; state: CheckpointState }[];
  moduleStates: { moduleId: string; orgUnitId: string | null; state: InstanceState; note: string | null }[];
}

/** A "Where we are" item on the slide: "2 · IN REVIEW" + name + note. */
export interface ParsedGate {
  name: string;
  stateRaw: string;
  note: string;
}
/** A state cell on the slide (LIVE / UAT / N/A …) with the headers it sits under and beside. */
export interface ParsedCell {
  column: string | null;
  row: string | null;
  stateRaw: string;
  note: string | null;
}

export interface GateChange {
  checkpointId: string;
  name: string;
  from: CheckpointState;
  to: CheckpointState;
  /** The slide's own words ("BRD v1 (Riverbank) · in review"). */
  source: string;
  /** The slide says blocked / decision needed — Blocked needs a linked blocker, so we
   * propose In progress and say so. */
  blockedWanted: boolean;
}
export interface ModuleChange {
  moduleId: string;
  name: string;
  orgUnitId: string | null;
  marketCode: string | null;
  from: InstanceState;
  to: InstanceState;
  note: string | null;
  source: string;
}
export interface DeliveryPlan {
  /** The market the slide is about (from its title), or null = the whole product. */
  market: CatalogMarket | null;
  gates: GateChange[];
  /** Gate items the slide names that already read the same in QUBIT. */
  gatesUnchanged: number;
  modules: ModuleChange[];
  modulesUnchanged: number;
  /** Slide items that named a known module or market but could not be placed. */
  unmatched: string[];
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => new Set(fold(s).split(" ").filter((t) => t.length > 2));

/** The catalog entry a slide label names: exact (folded) name or code, else the entry whose
 * own name is best covered by the label's words (≥ 60 %, clearly ahead of the runner-up).
 * "HAL: NEWPOS DEVICE REPAIR & MAINTENANCE" → "Hal device support"; "Kenya" → KE. */
export function matchName<T extends { name: string; code?: string }>(label: string, candidates: T[]): T | null {
  const f = fold(label);
  if (!f) return null;
  for (const c of candidates) if (fold(c.name) === f || (c.code && fold(c.code) === f)) return c;
  const lt = tokens(label);
  if (lt.size === 0) return null;
  let best: { c: T; score: number } | null = null;
  let second = 0;
  for (const c of candidates) {
    const ct = tokens(c.name);
    if (ct.size === 0) continue;
    let common = 0;
    for (const t of ct) if (lt.has(t)) common++;
    const score = common / ct.size;
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { c, score };
    } else if (score > second) second = score;
  }
  return best && best.score >= 0.6 && best.score > second ? best.c : null;
}

/** "Swipe Rwanda" against a product with a Rwanda market → { rest: "Swipe", market }. */
export function splitTitleMarket(title: string, markets: CatalogMarket[]): { rest: string; market: CatalogMarket | null } {
  const f = fold(title);
  for (const m of markets) {
    for (const needle of [fold(m.name), fold(m.code)]) {
      if (!needle) continue;
      // "… in Rwanda", "… — Rwanda", "Swipe Rwanda", "Rwanda Swipe"
      const tail = new RegExp(`(?:^|\\s)(?:in\\s+)?${needle}$`);
      const head = new RegExp(`^${needle}(?:\\s|$)`);
      if (tail.test(f)) return { rest: f.replace(tail, "").trim(), market: m };
      if (head.test(f) && f !== needle) return { rest: f.replace(head, "").trim(), market: m };
    }
  }
  return { rest: title, market: null };
}

const GATE_RANK: Record<CheckpointState, number> = { NotStarted: 0, InProgress: 1, Blocked: 1, Done: 2 };

/** What a stage label on the slide means for a gate. null = not a state word. */
export function gateStateFrom(raw: string): { state: CheckpointState; blockedWanted: boolean } | null {
  const s = fold(raw);
  if (!s) return null;
  if (/^(complete|completed|done|released|live|signed|approved|closed|delivered|achieved)\b/.test(s)) return { state: "Done", blockedWanted: false };
  if (/^(decision|blocked|stuck|at risk|escalated|waiting)\b/.test(s)) return { state: "InProgress", blockedWanted: true };
  if (/^(in review|review|in progress|ongoing|active|uat|sit|testing|in uat|in sit|build|in build|development|started|pilot|current)\b/.test(s)) return { state: "InProgress", blockedWanted: false };
  if (/^(on hold|planned|planning|not started|upcoming|next|pending|todo|backlog|later|hold)\b/.test(s)) return { state: "NotStarted", blockedWanted: false };
  return null;
}

/** What a cell on the slide means for a module in a market. null = not a state word. */
export function moduleStateFrom(raw: string): InstanceState | null {
  const s = fold(raw);
  if (!s) return null;
  if (/^(n a|na|not applicable|not in scope|n\/a)$/.test(s) || /^not applicable/.test(s)) return "NotApplicable";
  if (/^(live|in production|production|deployed|released|go live|done|complete)/.test(s)) return "Live";
  if (/^(uat|in uat|testing|sit|pilot|user acceptance)/.test(s)) return "UAT";
  if (/^(build|in build|dev|development|in development|building|in progress)/.test(s)) return "Build";
  if (/^(not yet live|planned|planning|not started|upcoming|pending|todo|backlog|scheduled|not live)/.test(s)) return "Planned";
  return null;
}

/** The note after a state ("LIVE | ACTIVELY MANAGING POS" → "Actively managing POS"). */
function sentence(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

export function resolveDelivery(
  row: { project: string; gates: ParsedGate[]; cells: ParsedCell[] },
  catalog: DeliveryCatalog,
  /** The PM's own choice of market (null = whole product); undefined = read the title. */
  opts: { market?: CatalogMarket | null } = {},
): DeliveryPlan {
  const market = opts.market === undefined ? splitTitleMarket(row.project, catalog.markets).market : opts.market;
  const unmatched = new Set<string>();

  // ── gates: the slide's stages on the product track (this market's copy when scoped) ──
  const scopeUnit = market?.orgUnitId ?? null;
  const currentGate = (checkpointId: string): CheckpointState =>
    catalog.gateStates.find((g) => g.orgUnitId === scopeUnit && g.checkpointId === checkpointId)?.state ?? "NotStarted";
  const byGate = new Map<string, GateChange>();
  let gatesUnchanged = 0;
  for (const g of row.gates) {
    const gate = matchName(g.name, catalog.gates);
    const want = gateStateFrom(g.stateRaw);
    if (!gate || !want) continue;
    const from = currentGate(gate.checkpointId);
    const source = `${g.name} · ${g.stateRaw.toLowerCase()}`;
    const prev = byGate.get(gate.checkpointId);
    // Two stages naming the same gate ("BRD v1 in review", "Signed BRD approval · decision"):
    // the furthest-along reading wins.
    if (prev && GATE_RANK[prev.to] >= GATE_RANK[want.state]) {
      prev.blockedWanted = prev.blockedWanted || want.blockedWanted;
      continue;
    }
    byGate.set(gate.checkpointId, { checkpointId: gate.checkpointId, name: gate.name, from, to: want.state, source, blockedWanted: want.blockedWanted });
  }
  const gates: GateChange[] = [];
  for (const c of byGate.values()) {
    if (c.to === c.from) gatesUnchanged++;
    else gates.push(c);
  }
  gates.sort((a, b) => (catalog.gates.find((g) => g.checkpointId === a.checkpointId)?.orderIndex ?? 0) - (catalog.gates.find((g) => g.checkpointId === b.checkpointId)?.orderIndex ?? 0));

  // ── modules: grid cells (column × row) or a list (section banner × row) ──
  const byCell = new Map<string, ModuleChange>();
  let modulesUnchanged = 0;
  for (const cell of row.cells) {
    const to = moduleStateFrom(cell.stateRaw);
    if (!to) continue;
    // Try column = module / row = market, then the other way round.
    let mod = cell.column ? matchName(cell.column, catalog.modules) : null;
    let mk = cell.row ? matchName(cell.row, catalog.markets) : null;
    if (!mod && !mk) {
      mod = cell.row ? matchName(cell.row, catalog.modules) : null;
      mk = cell.column ? matchName(cell.column, catalog.markets) : null;
    } else if (!mod && mk) {
      mod = cell.row && cell.row !== mk.name ? matchName(cell.row, catalog.modules) : null;
    } else if (mod && !mk && cell.column && cell.column !== mod.name) {
      mk = matchName(cell.column, catalog.markets);
    }
    if (!mod) {
      if (mk) unmatched.add(`${cell.column ?? cell.row ?? "?"} · ${cell.stateRaw}`);
      continue;
    }
    // No market on the cell: the slide's own market, else the product level.
    const unit = mk ?? market;
    const orgUnitId = unit?.orgUnitId ?? null;
    const key = `${mod.id}:${orgUnitId ?? "-"}`;
    const current = catalog.moduleStates.find((s) => s.moduleId === mod!.id && s.orgUnitId === orgUnitId);
    const from = current?.state ?? "Planned";
    const note = sentence(cell.note);
    const change: ModuleChange = { moduleId: mod.id, name: mod.name, orgUnitId, marketCode: unit?.code ?? null, from, to, note, source: `${cell.row ?? ""}${cell.row && cell.column ? " × " : ""}${cell.column ?? ""} · ${cell.stateRaw}`.trim() };
    if (byCell.has(key)) continue;
    byCell.set(key, change);
  }
  const modules: ModuleChange[] = [];
  for (const c of byCell.values()) {
    if (c.to === c.from && (c.note === null || c.note === (catalog.moduleStates.find((s) => s.moduleId === c.moduleId && s.orgUnitId === c.orgUnitId)?.note ?? null))) modulesUnchanged++;
    else modules.push(c);
  }
  const marketOrder = new Map(catalog.markets.map((m, i) => [m.orgUnitId, i]));
  const moduleOrder = new Map(catalog.modules.map((m, i) => [m.id, i]));
  modules.sort((a, b) => (marketOrder.get(a.orgUnitId ?? "") ?? -1) - (marketOrder.get(b.orgUnitId ?? "") ?? -1) || (moduleOrder.get(a.moduleId) ?? 0) - (moduleOrder.get(b.moduleId) ?? 0));

  return { market, gates, gatesUnchanged, modules, modulesUnchanged, unmatched: [...unmatched] };
}

export const GATE_STATE_LABEL: Record<CheckpointState, string> = { NotStarted: "Not started", InProgress: "In progress", Done: "Done", Blocked: "Blocked" };
export const MODULE_STATE_LABEL: Record<InstanceState, string> = { Planned: "Planned", Build: "Build", UAT: "UAT", Live: "Live", NotApplicable: "N/A" };

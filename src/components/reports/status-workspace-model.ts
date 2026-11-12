import { resolveDelivery, type DeliveryCatalog, type ParsedCell, type ParsedGate, type StageReading } from "@/lib/status-report-delivery";
import type { Rag } from "@/server/health";
import type { CheckpointState } from "@/server/checkpoints";
import type { InstanceState } from "@/server/project-instances";

/**
 * The weekly update workspace's client model (Reports › Weekly Update): the JSON the page
 * loads, the editable state of one project card, and the pure helpers that build, re-read
 * and diff cards. Client-safe — type-only server imports.
 */

export interface Product {
  status: "Draft" | "Confirmed" | "None";
  narrative: string;
  computedRag: Rag;
  ragOverride: Rag | null;
  statusNote: string;
  alreadySent: boolean;
}
export interface WorkspaceProject {
  catalog: DeliveryCatalog;
  product: Product;
  markets: { orgUnitId: string; rag: Rag | null; narrative: string }[];
}
export interface StatusWorkspaceJson {
  isoWeek: string;
  past: boolean;
  projects: WorkspaceProject[];
}
export interface PreviewRow {
  line: number;
  project: string;
  code: string | null;
  market: string | null;
  status: Rag | null;
  stage: string;
  update: string;
  warnings: string[];
  gates: ParsedGate[];
  cells: ParsedCell[];
  dimensions: { name: string; value: string }[];
  sections: { title: string; lines: string[] }[];
  match: { projectId: string | null; confidence: "exact" | "suggested" | "none"; orgUnitId?: string | null };
}
export interface Preview {
  format: "docx" | "xlsx" | "pdf" | "pptx";
  preparedBy: string | null;
  reportDate: string | null;
  rows: PreviewRow[];
  warnings: string[];
  fileName: string;
  base64: string;
}
export interface ApplyRow {
  projectId: string;
  code: string;
  outcome: "drafted" | "resent" | "sent" | "none" | "skipped" | "error";
  message?: string;
  attached: boolean;
  markets?: string | null;
  gates?: string | null;
  modules?: string | null;
  problems?: string[];
}

/** The editable state of one card. Keys: gates[scope][checkpointId], modules[`${moduleId}:${unit}`]. */
export interface Card {
  narrative: string;
  rag: Rag;
  /** The PM's reason when their rating differs from QUBIT's (required unless it came from the file). */
  ratingReason: string;
  stage: string;
  resend: boolean;
  scope: string; // "-" = product, else orgUnitId
  gates: Record<string, Record<string, CheckpointState>>;
  modules: Record<string, { state: InstanceState; note: string | null }>;
  markets: Record<string, { rag: Rag | null; narrative: string }>;
  sources: { title: string; lines: string[] }[];
  /** Keys the file changed, to show where a value came from. */
  fromFile: Record<string, string>;
  /** The PM's answer to "which gate is this stage?" (undefined = QUBIT's reading, null = none). */
  stageGateName?: string | null;
  /** Gate keys (scope:checkpointId) the stage reading set, so a new answer can undo them. */
  stageSet: string[];
}

export const RAGS: Rag[] = ["Green", "Amber", "Red"];
export const RAG_TONE: Record<Rag, "ok" | "warn" | "bad"> = { Green: "ok", Amber: "warn", Red: "bad" };
export const RAG_WORD: Record<Rag, string> = { Green: "On track", Amber: "At risk", Red: "Off track" };
export const GATE_STATES: CheckpointState[] = ["NotStarted", "InProgress", "Done"];
export const MODULE_STATES: InstanceState[] = ["Planned", "Build", "UAT", "Live", "NotApplicable"];
export const WEIGHT: Record<CheckpointState, number> = { Done: 1, InProgress: 0.5, Blocked: 0, NotStarted: 0 };
export const NARRATIVE_MAX = 500;
export const mkey = (moduleId: string, unit: string | null) => `${moduleId}:${unit ?? "-"}`;
export const progressOf = (states: CheckpointState[]) => (states.length ? Math.round((states.reduce((s, x) => s + WEIGHT[x], 0) / states.length) * 100) : 0);

/** A card as QUBIT has it now. */
export function baseCard(p: WorkspaceProject): Card {
  const gates: Record<string, Record<string, CheckpointState>> = {};
  for (const scope of ["-", ...p.catalog.markets.map((m) => m.orgUnitId)]) {
    gates[scope] = Object.fromEntries(p.catalog.gates.map((g) => [g.checkpointId, p.catalog.gateStates.find((s) => s.orgUnitId === (scope === "-" ? null : scope) && s.checkpointId === g.checkpointId)?.state ?? "NotStarted"]));
  }
  const modules: Card["modules"] = {};
  const units: (string | null)[] = p.catalog.markets.length ? p.catalog.markets.map((m) => m.orgUnitId) : [null];
  for (const m of p.catalog.modules)
    for (const u of units) {
      const st = p.catalog.moduleStates.find((s) => s.moduleId === m.id && s.orgUnitId === u);
      modules[mkey(m.id, u)] = { state: st?.state ?? "Planned", note: st?.note ?? null };
    }
  return {
    narrative: p.product.narrative,
    rag: p.product.ragOverride ?? p.product.computedRag,
    ratingReason: "",
    stage: p.product.statusNote,
    resend: false,
    scope: "-",
    gates,
    modules,
    markets: Object.fromEntries(p.markets.map((m) => [m.orgUnitId, { rag: m.rag, narrative: m.narrative }])),
    sources: [],
    fromFile: {},
    stageSet: [],
  };
}

/** Re-read a card's stage line into gates on the product scope: undo what the last reading
 * set, then set what this one says. Returns the reading for the clarifier. */
export function readStage(p: WorkspaceProject, base: Card, c: Card, stageGateName: string | null | undefined): { card: Card; reading: StageReading | null } {
  const next: Card = { ...c, gates: { ...c.gates, "-": { ...c.gates["-"] } }, fromFile: { ...c.fromFile }, stageSet: [] };
  for (const key of c.stageSet) {
    const [scope, cid] = key.split(":") as [string, string];
    next.gates[scope] = { ...next.gates[scope], [cid]: base.gates[scope]![cid]! };
    delete next.fromFile[`gate:${key}`];
  }
  if (!c.stage.trim()) return { card: next, reading: null };
  // Read against the card's CURRENT product-scope states, so "before X → done" respects hand edits.
  const catalog: DeliveryCatalog = { ...p.catalog, gateStates: [...p.catalog.gateStates.filter((g) => g.orgUnitId !== null), ...p.catalog.gates.map((g) => ({ orgUnitId: null, checkpointId: g.checkpointId, state: next.gates["-"]![g.checkpointId]!, approval: p.catalog.gateStates.find((s) => s.orgUnitId === null && s.checkpointId === g.checkpointId)?.approval }))] };
  const plan = resolveDelivery({ project: p.catalog.name, stage: c.stage, gates: [], cells: [] }, catalog, { market: null, ...(stageGateName === undefined ? {} : { stageGateName }) });
  for (const g of plan.gates) {
    next.gates["-"] = { ...next.gates["-"], [g.checkpointId]: g.to };
    next.fromFile[`gate:-:${g.checkpointId}`] = g.source;
    next.stageSet.push(`-:${g.checkpointId}`);
  }
  return { card: next, reading: plan.stage };
}

export interface Diff {
  product: boolean;
  stage: boolean;
  gates: { orgUnitId: string | null; checkpointId: string; name: string; from: CheckpointState; to: CheckpointState }[];
  modules: { moduleId: string; orgUnitId: string | null; name: string; code: string | null; from: InstanceState; to: InstanceState; note: string | null }[];
  markets: { orgUnitId: string; code: string; rag: Rag; narrative: string }[];
  count: number;
}
export function diffCard(p: WorkspaceProject, c: Card, base: Card): Diff {
  const product = c.narrative.trim() !== base.narrative.trim() || c.rag !== base.rag || (c.resend && p.product.alreadySent && Boolean(c.narrative.trim()));
  const stage = c.stage.trim() !== base.stage.trim();
  const gates: Diff["gates"] = [];
  for (const [scope, states] of Object.entries(c.gates))
    for (const g of p.catalog.gates) {
      const to = states[g.checkpointId]!;
      const from = base.gates[scope]![g.checkpointId]!;
      if (to !== from) gates.push({ orgUnitId: scope === "-" ? null : scope, checkpointId: g.checkpointId, name: g.name, from, to });
    }
  const modules: Diff["modules"] = [];
  for (const [k, v] of Object.entries(c.modules)) {
    const b = base.modules[k]!;
    if (v.state !== b.state || (v.note ?? null) !== (b.note ?? null)) {
      const [moduleId, unit] = k.split(":") as [string, string];
      const orgUnitId = unit === "-" ? null : unit;
      modules.push({ moduleId, orgUnitId, name: p.catalog.modules.find((m) => m.id === moduleId)?.name ?? "", code: p.catalog.markets.find((m) => m.orgUnitId === orgUnitId)?.code ?? null, from: b.state, to: v.state, note: v.note });
    }
  }
  const markets: Diff["markets"] = [];
  for (const [orgUnitId, v] of Object.entries(c.markets)) {
    const b = base.markets[orgUnitId]!;
    if (v.rag && v.narrative.trim() && (v.rag !== b.rag || v.narrative.trim() !== b.narrative.trim())) markets.push({ orgUnitId, code: p.catalog.markets.find((m) => m.orgUnitId === orgUnitId)?.code ?? "?", rag: v.rag, narrative: v.narrative.trim() });
  }
  return { product, stage, gates, modules, markets, count: (product ? 1 : 0) + (stage ? 1 : 0) + gates.length + modules.length + markets.length };
}

/** The apply payload for one card. `forceLine` sends the line even when it is unchanged
 * (a past week's Confirm & Send: the apply itself sends it). */
/** A rating the PM chose (not the file) that differs from QUBIT's needs their own reason. */
export function needsRatingReason(p: WorkspaceProject, c: Card): boolean {
  return c.rag !== p.product.computedRag && !c.fromFile.rag;
}
export const RATING_REASON_MIN = 5;
export function ratingReasonMissing(p: WorkspaceProject, c: Card): boolean {
  return needsRatingReason(p, c) && c.ratingReason.trim().length < RATING_REASON_MIN;
}

export function applyRowFor(p: WorkspaceProject, c: Card, d: Diff, forceLine = false) {
  const line = d.product || forceLine ? c.narrative.trim() : "";
  return {
    projectId: p.catalog.projectId,
    narrative: line,
    rag: c.rag,
    ...(needsRatingReason(p, c) && c.ratingReason.trim() ? { ratingReason: c.ratingReason.trim().slice(0, 300) } : {}),
    stage: d.stage ? c.stage.trim() : "",
    resend: c.resend,
    gates: d.gates.map((g) => ({ checkpointId: g.checkpointId, state: g.to, orgUnitId: g.orgUnitId })),
    modules: d.modules.map((m) => ({ moduleId: m.moduleId, orgUnitId: m.orgUnitId, state: m.to, note: m.note })),
    markets: d.markets.map((m) => ({ orgUnitId: m.orgUnitId, rag: m.rag, narrative: m.narrative })),
  };
}

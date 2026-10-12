"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileText, Flag, Layers, Loader2, Plus, Search, Send, Upload } from "lucide-react";
import { isoWeekId, isoWeekMonday, shiftIsoWeek, weekRange } from "@/lib/iso-week";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, PRIMARY, QUIET, SECONDARY, ragChipStyle } from "@/lib/surface";
import { GATE_STATE_LABEL, MODULE_STATE_LABEL, resolveDelivery, type CatalogMarket, type DeliveryCatalog, type ParsedCell, type ParsedGate, type StageReading } from "@/lib/status-report-delivery";
import type { Rag } from "@/server/health";
import type { CheckpointState } from "@/server/checkpoints";
import type { InstanceState } from "@/server/project-instances";

/**
 * Reports › Update all my projects — the weekly update workspace. One card per project
 * the viewer runs, prefilled from QUBIT: the line for the Head and its RAG, the status
 * note, EVERY gate on the Product build track (per scope: the product, or one market's
 * copy), every channel's state per market, and each market's own check-in — all editable
 * in place, with the derived progress updating as gates move. A status report (Word,
 * Excel, PDF, PowerPoint) only prefills the cards; nothing is written until "Apply", and
 * the Head gets a line only when the PM sends it from the queue.
 */

interface Product {
  status: "Draft" | "Confirmed" | "None";
  narrative: string;
  computedRag: Rag;
  ragOverride: Rag | null;
  statusNote: string;
  alreadySent: boolean;
}
interface WorkspaceProject {
  catalog: DeliveryCatalog;
  product: Product;
  markets: { orgUnitId: string; rag: Rag | null; narrative: string }[];
}
export interface StatusWorkspaceJson {
  isoWeek: string;
  past: boolean;
  projects: WorkspaceProject[];
}
interface PreviewRow {
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
interface Preview {
  format: "docx" | "xlsx" | "pdf" | "pptx";
  preparedBy: string | null;
  reportDate: string | null;
  rows: PreviewRow[];
  warnings: string[];
  fileName: string;
  base64: string;
}
interface ApplyRow {
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
interface Card {
  narrative: string;
  rag: Rag;
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

const RAGS: Rag[] = ["Green", "Amber", "Red"];
const GATE_STATES: CheckpointState[] = ["NotStarted", "InProgress", "Done"];
const MODULE_STATES: InstanceState[] = ["Planned", "Build", "UAT", "Live", "NotApplicable"];
const WEIGHT: Record<CheckpointState, number> = { Done: 1, InProgress: 0.5, Blocked: 0, NotStarted: 0 };
const NARRATIVE_MAX = 500;
const INPUT = `rounded-[8px] border border-[var(--input)] bg-background px-2.5 py-1.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`;
const SELECT = `h-7 rounded-[7px] border border-[var(--input)] bg-background px-1.5 text-[11.5px] font-semibold text-foreground focus:border-brand ${FOCUS}`;
const LABEL = "font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]";
const mkey = (moduleId: string, unit: string | null) => `${moduleId}:${unit ?? "-"}`;
const progressOf = (states: CheckpointState[]) => (states.length ? Math.round((states.reduce((s, x) => s + WEIGHT[x], 0) / states.length) * 100) : 0);
const GATE_TOK: Record<CheckpointState, string> = { Done: "--ok", InProgress: "--qinfo", Blocked: "--bad", NotStarted: "--ink4" };
const MODULE_TOK: Record<InstanceState, string> = { Planned: "--ink4", Build: "--qinfo", UAT: "--warn", Live: "--ok", NotApplicable: "--ink5" };

/** A card as QUBIT has it now. */
function baseCard(p: WorkspaceProject): Card {
  const gates: Record<string, Record<string, CheckpointState>> = {};
  for (const scope of ["-", ...p.catalog.markets.map((m) => m.orgUnitId)]) {
    gates[scope] = Object.fromEntries(p.catalog.gates.map((g) => [g.checkpointId, p.catalog.gateStates.find((s) => s.orgUnitId === (scope === "-" ? null : scope) && s.checkpointId === g.checkpointId)?.state ?? "NotStarted"]));
  }
  const modules: Card["modules"] = {};
  const units: (string | null)[] = p.catalog.markets.length ? p.catalog.markets.map((m) => m.orgUnitId) : [null];
  for (const m of p.catalog.modules) for (const u of units) {
    const st = p.catalog.moduleStates.find((s) => s.moduleId === m.id && s.orgUnitId === u);
    modules[mkey(m.id, u)] = { state: st?.state ?? "Planned", note: st?.note ?? null };
  }
  return {
    narrative: p.product.narrative,
    rag: p.product.ragOverride ?? p.product.computedRag,
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
function readStage(p: WorkspaceProject, base: Card, c: Card, stageGateName: string | null | undefined): { card: Card; reading: StageReading | null } {
  const next: Card = { ...c, gates: { ...c.gates, "-": { ...c.gates["-"] } }, fromFile: { ...c.fromFile }, stageSet: [] };
  for (const key of c.stageSet) {
    const [scope, cid] = key.split(":") as [string, string];
    next.gates[scope] = { ...next.gates[scope], [cid]: base.gates[scope]![cid]! };
    delete next.fromFile[`gate:${key}`];
  }
  if (!c.stage.trim()) return { card: next, reading: null };
  // Read against the card's CURRENT product-scope states, so "before X → done" respects hand edits.
  const catalog: DeliveryCatalog = { ...p.catalog, gateStates: [...p.catalog.gateStates.filter((g) => g.orgUnitId !== null), ...p.catalog.gates.map((g) => ({ orgUnitId: null, checkpointId: g.checkpointId, state: next.gates["-"]![g.checkpointId]! }))] };
  const plan = resolveDelivery({ project: p.catalog.name, stage: c.stage, gates: [], cells: [] }, catalog, { market: null, ...(stageGateName === undefined ? {} : { stageGateName }) });
  for (const g of plan.gates) {
    next.gates["-"] = { ...next.gates["-"], [g.checkpointId]: g.to };
    next.fromFile[`gate:-:${g.checkpointId}`] = g.source;
    next.stageSet.push(`-:${g.checkpointId}`);
  }
  return { card: next, reading: plan.stage };
}

interface Diff {
  product: boolean;
  stage: boolean;
  gates: { orgUnitId: string | null; checkpointId: string; name: string; from: CheckpointState; to: CheckpointState }[];
  modules: { moduleId: string; orgUnitId: string | null; name: string; code: string | null; from: InstanceState; to: InstanceState; note: string | null }[];
  markets: { orgUnitId: string; code: string; rag: Rag; narrative: string }[];
  count: number;
}
function diffCard(p: WorkspaceProject, c: Card, base: Card): Diff {
  const product = c.narrative.trim() !== base.narrative.trim() || c.rag !== base.rag || (c.resend && p.product.alreadySent && Boolean(c.narrative.trim()));
  const stage = c.stage.trim() !== base.stage.trim();
  const gates: Diff["gates"] = [];
  for (const [scope, states] of Object.entries(c.gates)) for (const g of p.catalog.gates) {
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

type WeekMode = "this" | "last" | "custom";

export function StatusWorkspace({ initial, uploadHint = false }: { initial: StatusWorkspaceJson; uploadHint?: boolean }) {
  const router = useRouter();
  const [ws, setWs] = useState<StatusWorkspaceJson>(initial);
  const [weekMode, setWeekMode] = useState<WeekMode>("this");
  const [customDate, setCustomDate] = useState("");
  const thisWeek = isoWeekId(new Date());
  const week = weekMode === "this" ? thisWeek : weekMode === "last" ? shiftIsoWeek(thisWeek, -1) : customDate ? isoWeekId(new Date(`${customDate}T12:00:00Z`)) : null;
  const weekLabel = (w: string) => `Week ${w.split("-W")[1]} · ${weekRange(isoWeekMonday(w))}`;
  const bases = useMemo(() => Object.fromEntries(ws.projects.map((p) => [p.catalog.projectId, baseCard(p)])), [ws]);
  const [cards, setCards] = useState<Record<string, Card>>(() => Object.fromEntries(ws.projects.map((p) => [p.catalog.projectId, baseCard(p)])));
  const [file, setFile] = useState<Preview | null>(null);
  const [unplaced, setUnplaced] = useState<PreviewRow[]>([]);
  const [attach, setAttach] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [busy, setBusy] = useState<"load" | "read" | "apply" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApplyRow[] | null>(null);
  const [teaching, setTeaching] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** The clarifier: re-read a card's stage line (typed, or answered by the PM). */
  const rereadStage = (id: string, stageGateName?: string | null, stage?: string) =>
    setCards((all) => {
      const p = ws.projects.find((x) => x.catalog.projectId === id)!;
      const c = { ...all[id]!, ...(stage !== undefined ? { stage } : {}), ...(stageGateName !== undefined ? { stageGateName } : {}) };
      return { ...all, [id]: readStage(p, bases[id]!, c, c.stageGateName).card };
    });

  /** Teach QUBIT a phrase → gate, tenant-wide, and re-read every card's stage with it. */
  async function teach(id: string, term: string, gateName: string | null) {
    setTeaching(term);
    setError(null);
    const res = await fetch("/api/reports/status-upload/stage-terms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term, gateName }) });
    const body = await res.json().catch(() => null);
    setTeaching(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not save the phrase.");
      return;
    }
    const saved = body.data as { term: string; gateName: string | null };
    setWs((w) => ({
      ...w,
      projects: w.projects.map((p) => ({ ...p, catalog: { ...p.catalog, stageTerms: [...(p.catalog.stageTerms ?? []).filter((t) => t.term !== saved.term), ...(saved.gateName ? [{ term: saved.term, gateName: saved.gateName }] : [])] } })),
    }));
    // The answer is now the reading itself.
    setCards((all) => ({ ...all, [id]: { ...all[id]!, stageGateName: undefined } }));
  }
  const uploadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (uploadHint) uploadRef.current?.focus();
  }, [uploadHint]);

  const patch = (id: string, fn: (c: Card) => Card) => setCards((all) => ({ ...all, [id]: fn(all[id]!) }));

  /** Reload the workspace for a week and rebase every card. */
  async function load(w: string) {
    setBusy("load");
    setError(null);
    setResults(null);
    const res = await fetch(`/api/reports/status-upload/workspace?week=${w}`);
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok || !body?.data) {
      setError(body?.error?.message ?? "Could not load your projects.");
      return;
    }
    const next = body.data as StatusWorkspaceJson;
    setWs(next);
    setCards(Object.fromEntries(next.projects.map((p) => [p.catalog.projectId, baseCard(p)])));
    setFile(null);
    setUnplaced([]);
  }
  useEffect(() => {
    if (week && week !== ws.isoWeek) void load(week);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  /** Lay a parsed row onto a project's card (the file's values, every change shown). */
  function mergeRow(row: PreviewRow, projectId: string, orgUnitId: string | null, project: WorkspaceProject) {
    const market = orgUnitId ? (project.catalog.markets.find((m) => m.orgUnitId === orgUnitId) ?? null) : null;
    const plan = resolveDelivery(row, project.catalog, { market });
    patch(projectId, (c) => {
      const next: Card = { ...c, gates: { ...c.gates }, modules: { ...c.modules }, markets: { ...c.markets }, fromFile: { ...c.fromFile }, sources: [...c.sources, ...row.sections] };
      const tag = row.project;
      if (market) {
        if (row.update) next.markets[market.orgUnitId] = { rag: row.status ?? c.markets[market.orgUnitId]?.rag ?? "Amber", narrative: row.update };
        next.fromFile[`market:${market.orgUnitId}`] = tag;
      } else {
        if (row.update) {
          next.narrative = row.update;
          next.fromFile.narrative = tag;
        }
        if (row.status) {
          next.rag = row.status;
          next.fromFile.rag = tag;
        }
        if (row.stage) {
          next.stage = row.stage;
          next.fromFile.stage = tag;
        }
        if (project.product.alreadySent) next.resend = true;
      }
      const scope = market ? market.orgUnitId : "-";
      for (const g of plan.gates) {
        if (!market && plan.stage) next.stageSet.push(`-:${g.checkpointId}`);
        if (g.backwards) continue; // a stale file never undoes progress by reflex — the PM can still set it by hand
        next.gates[scope] = { ...next.gates[scope], [g.checkpointId]: g.to };
        next.fromFile[`gate:${scope}:${g.checkpointId}`] = g.source;
      }
      for (const m of plan.modules) {
        if (m.backwards) continue;
        const k = mkey(m.moduleId, m.orgUnitId);
        next.modules[k] = { state: m.to, note: m.note ?? next.modules[k]?.note ?? null };
        next.fromFile[`module:${k}`] = m.source;
      }
      if (market) next.scope = market.orgUnitId;
      return next;
    });
  }

  async function read(f: File | undefined) {
    if (!f || !week) return;
    setBusy("read");
    setError(null);
    setResults(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("week", week);
    const res = await fetch("/api/reports/status-upload", { method: "POST", body: fd });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "The file could not be read.");
      return;
    }
    const p = body.data as Preview;
    setFile(p);
    const loose: PreviewRow[] = [];
    for (const row of p.rows) {
      const project = row.match.projectId ? ws.projects.find((x) => x.catalog.projectId === row.match.projectId) : null;
      if (project && row.match.confidence === "exact") mergeRow(row, project.catalog.projectId, row.match.orgUnitId ?? null, project);
      else loose.push(row);
    }
    setUnplaced(loose);
  }

  async function createFor(row: PreviewRow) {
    setBusy("create");
    setError(null);
    const res = await fetch("/api/reports/status-upload/create-project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: row.project }) });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not create the project.");
      return;
    }
    const catalog = body.data.catalog as DeliveryCatalog;
    const project: WorkspaceProject = { catalog, product: { status: "None", narrative: "", computedRag: "Green", ragOverride: null, statusNote: "", alreadySent: false }, markets: [] };
    setWs((w) => ({ ...w, projects: [...w.projects, project].sort((a, b) => a.catalog.name.localeCompare(b.catalog.name)) }));
    setCards((all) => ({ ...all, [catalog.projectId]: baseCard(project) }));
    setUnplaced((u) => u.filter((r) => r.line !== row.line));
    // The card exists on the next render; merge after state settles.
    setTimeout(() => mergeRow(row, catalog.projectId, null, project), 0);
  }

  function placeRow(row: PreviewRow, projectId: string) {
    const project = ws.projects.find((x) => x.catalog.projectId === projectId);
    if (!project) return;
    const orgUnitId = row.market ? (project.catalog.markets.find((m) => m.code.toLowerCase() === row.market!.toLowerCase() || m.name.toLowerCase() === row.market!.toLowerCase())?.orgUnitId ?? null) : null;
    mergeRow(row, projectId, orgUnitId, project);
    setUnplaced((u) => u.filter((r) => r.line !== row.line));
  }

  const diffs = useMemo(() => Object.fromEntries(ws.projects.map((p) => [p.catalog.projectId, diffCard(p, cards[p.catalog.projectId] ?? bases[p.catalog.projectId]!, bases[p.catalog.projectId]!)])), [ws, cards, bases]);
  const changed = ws.projects.filter((p) => diffs[p.catalog.projectId]!.count > 0);
  const totals = changed.reduce(
    (t, p) => {
      const d = diffs[p.catalog.projectId]!;
      return { lines: t.lines + (d.product ? 1 : 0), gates: t.gates + d.gates.length, modules: t.modules + d.modules.length, markets: t.markets + d.markets.length };
    },
    { lines: 0, gates: 0, modules: 0, markets: 0 },
  );
  const visible = ws.projects.filter((p) => (!onlyChanged || diffs[p.catalog.projectId]!.count > 0) && (!query || `${p.catalog.code} ${p.catalog.name}`.toLowerCase().includes(query.toLowerCase())));

  async function apply() {
    setBusy("apply");
    setError(null);
    const res = await fetch("/api/reports/status-upload/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        week: ws.isoWeek,
        preparedBy: file?.preparedBy ?? null,
        reportDate: file?.reportDate ?? null,
        rows: changed.map((p) => {
          const id = p.catalog.projectId;
          const c = cards[id]!;
          const d = diffs[id]!;
          return {
            projectId: id,
            narrative: d.product ? c.narrative.trim() : "",
            rag: c.rag,
            stage: d.stage ? c.stage.trim() : "",
            resend: c.resend,
            gates: d.gates.map((g) => ({ checkpointId: g.checkpointId, state: g.to, orgUnitId: g.orgUnitId })),
            modules: d.modules.map((m) => ({ moduleId: m.moduleId, orgUnitId: m.orgUnitId, state: m.to, note: m.note })),
            markets: d.markets.map((m) => ({ orgUnitId: m.orgUnitId, rag: m.rag, narrative: m.narrative })),
          };
        }),
        ...(file && attach ? { file: { name: file.fileName, format: file.format, base64: file.base64 } } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not apply.");
      return;
    }
    setResults(body.data as ApplyRow[]);
    router.refresh();
    await load(ws.isoWeek);
    setResults(body.data as ApplyRow[]);
  }

  const applyLabel = () => {
    const parts: string[] = [];
    if (totals.lines) parts.push(`${totals.lines} ${totals.lines === 1 ? "line" : "lines"}`);
    if (totals.markets) parts.push(`${totals.markets} market check-in${totals.markets === 1 ? "" : "s"}`);
    if (totals.gates) parts.push(`${totals.gates} gate${totals.gates === 1 ? "" : "s"}`);
    if (totals.modules) parts.push(`${totals.modules} channel state${totals.modules === 1 ? "" : "s"}`);
    return parts.length ? `Apply ${parts.join(" · ")}` : "Nothing changed yet";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── toolbar: week, file, filters ── */}
      <section className={`${CARD} flex flex-wrap items-center gap-x-4 gap-y-3 p-4`} style={CARD_BG} aria-label="Week and source">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="sr-only">Report for</legend>
          {(
            [
              ["this", "This week"],
              ["last", "Last week"],
              ["custom", "Past week"],
            ] as [WeekMode, string][]
          ).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setWeekMode(m)} aria-pressed={weekMode === m} className={`${weekMode === m ? PRIMARY : SECONDARY} px-3 py-1.5 text-[12.5px]`}>
              {label}
            </button>
          ))}
          {weekMode === "custom" && <input type="date" value={customDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustomDate(e.target.value)} aria-label="A date in the week" className={INPUT} />}
          <span className="ml-1 text-[12px] text-[var(--ink4)]">
            {week ? weekLabel(week) : "Pick a date"}
            {ws.past && " · past week: lines are sent as you apply"}
            {busy === "load" && <Loader2 className="ml-1 inline size-3 animate-spin" aria-hidden />}
          </span>
        </fieldset>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx,.pdf" className="sr-only" aria-label="Status report file" onChange={(e) => void read(e.target.files?.[0])} />
          <button ref={uploadRef} type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null || !week} className={`${SECONDARY} gap-1.5 ${uploadHint ? "ring-2 ring-[var(--brand)]" : ""}`} title="Prefill the cards from a status report: Word, Excel or PDF table, the milestone tracker, or a PowerPoint one-pager per project or market">
            <Upload className="size-3.5" aria-hidden /> {busy === "read" ? "Reading…" : "Prefill from a report"}
          </button>
          <label className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ink4)]" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a project" aria-label="Find a project" className={`${INPUT} w-[170px] pl-7`} />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--ink3)]">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="size-3.5 accent-[var(--brand)]" /> Changed only
          </label>
        </div>
        {file && (
          <p className="flex w-full flex-wrap items-center gap-x-2 text-[12px] text-[var(--ink3)]">
            <FileText className="size-3.5 text-[var(--ink4)]" aria-hidden />
            <b className="text-[var(--qink)]">{file.fileName}</b>
            {file.preparedBy && <span>· prepared by {file.preparedBy}</span>}
            {file.reportDate && <span>· {file.reportDate}</span>}
            <span>· {file.rows.length - unplaced.length} of {file.rows.length} rows placed on your projects</span>
            <label className="ml-2 flex items-center gap-1.5">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="size-3.5 accent-[var(--brand)]" /> Attach the file to each project&apos;s Documents
            </label>
            {file.warnings.map((w) => (
              <span key={w} className="text-[var(--warn)]">
                · {w}
              </span>
            ))}
          </p>
        )}
        {error && (
          <p role="alert" className="w-full text-[12px] text-[var(--bad)]">
            {error}
          </p>
        )}
      </section>

      {/* ── rows the file could not place ── */}
      {unplaced.length > 0 && (
        <section className={`${CARD} p-4`} style={CARD_BG} aria-labelledby="unplaced">
          <h2 id="unplaced" className="text-[13px] font-semibold text-[var(--qink)]">
            Rows in the file with no project yet
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {unplaced.map((r) => {
              const suggested = r.match.confidence === "suggested" ? ws.projects.find((p) => p.catalog.projectId === r.match.projectId) : null;
              return (
                <li key={r.line} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <span className="font-semibold text-[var(--qink)]">{r.project}</span>
                  {r.status && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={ragChipStyle(r.status)}>
                      {r.status}
                    </span>
                  )}
                  <select defaultValue={suggested?.catalog.projectId ?? ""} onChange={(e) => e.target.value && placeRow(r, e.target.value)} aria-label={`Project for ${r.project}`} className={`${INPUT} w-[220px]`}>
                    <option value="">{suggested ? `Place on ${suggested.catalog.code} · ${suggested.catalog.name}?` : "Pick the project…"}</option>
                    {ws.projects.map((p) => (
                      <option key={p.catalog.projectId} value={p.catalog.projectId}>
                        {p.catalog.code} · {p.catalog.name}
                      </option>
                    ))}
                  </select>
                  {suggested && (
                    <button type="button" onClick={() => placeRow(r, suggested.catalog.projectId)} className={`${QUIET} text-[var(--brand)]`}>
                      Yes, {suggested.catalog.code}
                    </button>
                  )}
                  <span className="text-[var(--ink4)]">or</span>
                  <button type="button" onClick={() => void createFor(r)} disabled={busy !== null} className={`${QUIET} inline-flex items-center gap-1 text-[var(--brand)]`}>
                    <Plus className="size-3" aria-hidden /> {busy === "create" ? "Creating…" : "create it as a new project"}
                  </button>
                  <button type="button" onClick={() => setUnplaced((u) => u.filter((x) => x.line !== r.line))} className={QUIET}>
                    Skip
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── results ── */}
      {results && (
        <section className={`${CARD} p-4`} style={CARD_BG} aria-labelledby="applied">
          <h2 id="applied" className="flex items-center gap-2 text-[13px] font-semibold text-[var(--qink)]">
            <Check className="size-4 text-[var(--ok)]" aria-hidden /> Applied
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
            {results.map((r) => {
              const good = r.outcome !== "skipped" && r.outcome !== "error";
              const line = r.outcome === "drafted" ? "line drafted — send it from the queue" : r.outcome === "resent" ? "line replaced & resent to the Head" : r.outcome === "sent" ? "line sent to the Head" : r.outcome === "none" ? null : r.message;
              return (
                <li key={r.projectId} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono text-[11px] font-semibold text-[var(--ink3)]">{r.code}</span>
                  {line && <span style={{ color: good ? "var(--ok)" : r.outcome === "skipped" ? "var(--warn)" : "var(--bad)" }}>{line}</span>}
                  {r.markets && <span className="text-[var(--ink3)]">· {r.markets}</span>}
                  {r.gates && <span className="text-[var(--ink3)]">· gates: {r.gates}</span>}
                  {r.modules && <span className="text-[var(--ink3)]">· channels: {r.modules}</span>}
                  {r.attached && <span className="text-[var(--ink3)]">· report attached</span>}
                  {r.problems?.map((p) => (
                    <span key={p} className="text-[var(--bad)]">
                      · {p}
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12.5px] text-[var(--ink3)]">
            Drafted lines wait in the queue with their RAG.{" "}
            <Link href="/reports" className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline">
              Review &amp; send →
            </Link>
          </p>
        </section>
      )}

      {/* ── one card per project ── */}
      {visible.length === 0 && <p className="text-[12.5px] text-[var(--ink4)]">{ws.projects.length === 0 ? "You don't run any projects yet." : onlyChanged ? "Nothing changed yet." : "No project matches."}</p>}
      {visible.map((p) => {
        const id = p.catalog.projectId;
        const c = cards[id]!;
        const base = bases[id]!;
        const d = diffs[id]!;
        const scopeStates = c.gates[c.scope]!;
        const baseScope = base.gates[c.scope]!;
        const pNow = progressOf(Object.values(baseScope));
        const pNext = progressOf(Object.values(scopeStates));
        const units: (string | null)[] = p.catalog.markets.length ? p.catalog.markets.map((m) => m.orgUnitId) : [null];
        const marketOf = (u: string | null): CatalogMarket | null => p.catalog.markets.find((m) => m.orgUnitId === u) ?? null;
        return (
          <section key={id} className={`${CARD} overflow-hidden`} style={CARD_BG} aria-labelledby={`card-${id}`}>
            {/* header */}
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[var(--hair2)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 id={`card-${id}`} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--qink)]">
                  <span className="font-mono text-[11px] font-bold text-[var(--ink3)]">{p.catalog.code}</span>
                  {p.catalog.name}
                  {d.count > 0 && <span className="rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--onbrand)]">{d.count} {d.count === 1 ? "change" : "changes"}</span>}
                  {p.product.alreadySent && <span className="rounded-full border border-[var(--hair)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink3)]">sent this week</span>}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-[var(--ink4)]">
                  {p.catalog.templateName ?? "No gate template"} · progress {pNow}%{pNext !== pNow && <b className="text-[var(--qink)]"> → {pNext}%</b>}
                  {p.catalog.markets.length > 0 && ` · ${p.catalog.markets.length} markets`}
                  {p.catalog.modules.length > 0 && ` · ${p.catalog.modules.length} ${p.catalog.moduleLabel.toLowerCase()}`}
                </p>
              </div>
              <fieldset className="flex flex-col gap-1" aria-label={`RAG for ${p.catalog.name}`}>
                <legend className={LABEL}>
                  RAG {c.rag === p.product.computedRag ? <span className="normal-case tracking-normal text-[var(--ink5)]">· computed</span> : null}
                  {c.fromFile.rag && <span className="normal-case tracking-normal text-[var(--ink5)]"> · from file</span>}
                </legend>
                <div className="flex gap-1">
                  {RAGS.map((g) => (
                    <label key={g} className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold has-[:checked]:ring-2 has-[:checked]:ring-[var(--brand)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)]" style={ragChipStyle(g)}>
                      <input type="radio" name={`rag-${id}`} value={g} checked={c.rag === g} onChange={() => patch(id, (x) => ({ ...x, rag: g }))} className="sr-only" />
                      {g}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
              {/* ── this week ── */}
              <div className="flex min-w-0 flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>
                    Line for the Head{c.fromFile.narrative && <span className="normal-case tracking-normal text-[var(--ink5)]"> · from file</span>}
                  </span>
                  <textarea value={c.narrative} maxLength={NARRATIVE_MAX} rows={4} onChange={(e) => patch(id, (x) => ({ ...x, narrative: e.target.value }))} aria-label={`Line for ${p.catalog.name}`} placeholder="What leadership should know this week" className={`${INPUT} w-full resize-y`} />
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.sources.map((s, i) => {
                    const add = s.lines.filter((l) => !/\[(date|name)\]/i.test(l) && !/^owner:/i.test(l)).slice(0, 3).join("; ");
                    const fits = c.narrative.length + add.length + s.title.length + 4 <= NARRATIVE_MAX;
                    return (
                      <button key={`${s.title}-${i}`} type="button" disabled={!add || !fits || c.narrative.includes(add)} onClick={() => patch(id, (x) => ({ ...x, narrative: `${x.narrative.trim()}${x.narrative.trim() ? " " : ""}${s.title}: ${add}.` }))} title={fits ? `Add: ${add}` : "No room left"} className={`inline-flex items-center gap-1 rounded-full border border-[var(--hair)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink3)] transition-colors hover:border-brand hover:text-brand disabled:opacity-40 ${FOCUS}`}>
                        <Plus className="size-3" aria-hidden /> {s.title}
                      </button>
                    );
                  })}
                  <span className="ml-auto text-[10.5px] tabular-nums text-[var(--ink5)]">
                    {c.narrative.length}/{NARRATIVE_MAX}
                  </span>
                </div>
                {p.product.alreadySent && (
                  <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--qink)]">
                    <input type="checkbox" checked={c.resend} onChange={(e) => patch(id, (x) => ({ ...x, resend: e.target.checked }))} className="size-3.5 accent-[var(--brand)]" />
                    Replace the sent line &amp; resend
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className={LABEL}>
                    Status note (stage){c.fromFile.stage && <span className="normal-case tracking-normal text-[var(--ink5)]"> · from file</span>}
                  </span>
                  <input value={c.stage} maxLength={200} onChange={(e) => rereadStage(id, undefined, e.target.value)} aria-label={`Status note for ${p.catalog.name}`} placeholder="e.g. UAT · pilot readiness" className={`${INPUT} w-full`} />
                </label>
                {c.stage.trim() && (() => {
                  const reading = readStage(p, base, c, c.stageGateName).reading;
                  const known = p.catalog.stageTerms ?? [];
                  const clauses = (reading?.clauses ?? []).filter((cl) => !known.some((t) => t.term === cl.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
                  return (
                    <div className="flex flex-col gap-1 rounded-[8px] border border-[var(--hair2)] px-2.5 py-2 text-[11.5px]">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[var(--ink3)]">
                          Stage reads as
                          {reading?.matched && <span className="text-[var(--ink5)]"> (from “{reading.matched}”{reading.learned ? ", learned" : ""})</span>}
                        </span>
                        <select value={c.stageGateName === undefined ? (reading?.gateName ?? "") : (c.stageGateName ?? "")} onChange={(e) => rereadStage(id, e.target.value || null)} aria-label={`Gate for the stage of ${p.catalog.name}`} className={SELECT}>
                          <option value="">no gate</option>
                          {p.catalog.gates.map((g) => (
                            <option key={g.checkpointId} value={g.name}>
                              {g.name}
                              {reading?.gateName === g.name && c.stageGateName === undefined && reading.state ? ` · ${GATE_STATE_LABEL[reading.state].toLowerCase()}` : ""}
                            </option>
                          ))}
                        </select>
                        {reading?.state && reading.gateName && <span className="text-[var(--ink4)]">→ {GATE_STATE_LABEL[reading.state].toLowerCase()}, earlier gates done</span>}
                      </div>
                      {reading?.gateName && clauses.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[var(--ink4)]">
                          Remember for next time:
                          {clauses.map((cl) => (
                            <button key={cl} type="button" disabled={teaching !== null} onClick={() => void teach(id, cl, reading.gateName)} className={`inline-flex items-center gap-1 rounded-full border border-[var(--hair)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink3)] transition-colors hover:border-brand hover:text-brand disabled:opacity-50 ${FOCUS}`} title={`“${cl}” will always read as ${reading.gateName}`}>
                              <Plus className="size-3" aria-hidden /> “{cl}” = {reading.gateName}
                            </button>
                          ))}
                        </div>
                      )}
                      {reading && !reading.gateName && clauses.length > 0 && <span className="text-[var(--warn)]">New words — pick the gate they mean and QUBIT can remember them.</span>}
                    </div>
                  );
                })()}
              </div>

              {/* ── gates ── */}
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${LABEL} inline-flex items-center gap-1`}>
                    <Flag className="size-3" aria-hidden /> Gates
                  </span>
                  {p.catalog.markets.length > 0 && (
                    <select value={c.scope} onChange={(e) => patch(id, (x) => ({ ...x, scope: e.target.value }))} aria-label={`Gate scope for ${p.catalog.name}`} className={SELECT}>
                      <option value="-">Product · every market</option>
                      {p.catalog.markets.map((m) => (
                        <option key={m.orgUnitId} value={m.orgUnitId}>
                          {m.flag ? `${m.flag} ` : ""}
                          {m.name} only
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="ml-auto font-mono text-[10.5px] tabular-nums text-[var(--ink4)]">
                    {pNow}%{pNext !== pNow && <b className="text-[var(--qink)]"> → {pNext}%</b>}
                  </span>
                </div>
                {p.catalog.gates.length === 0 ? (
                  <p className="text-[12px] text-[var(--ink4)]">No gate template on this project — pick one in the workspace.</p>
                ) : (
                  <ul className="flex flex-col">
                    {p.catalog.gates.map((g) => {
                      const to = scopeStates[g.checkpointId]!;
                      const from = baseScope[g.checkpointId]!;
                      const src = c.fromFile[`gate:${c.scope}:${g.checkpointId}`];
                      return (
                        <li key={g.checkpointId} className={`flex items-center gap-2 border-b border-[var(--hair2)] py-1 last:border-0 ${to !== from ? "bg-[color-mix(in_oklab,var(--brand)_6%,transparent)]" : ""}`}>
                          <span className="size-2 flex-none rounded-full" style={{ background: `var(${GATE_TOK[to]})` }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink2)]" title={src ? `file: ${src}` : undefined}>
                            {g.name}
                            {to !== from && <span className="ml-1.5 text-[10.5px] text-[var(--ink4)]">was {GATE_STATE_LABEL[from]}</span>}
                            {src && <FileText className="ml-1 inline size-3 text-[var(--ink4)]" aria-label="from file" />}
                          </span>
                          {from === "Blocked" ? (
                            <span className="text-[11px] font-semibold text-[var(--bad)]">Blocked</span>
                          ) : (
                            <select value={to} onChange={(e) => patch(id, (x) => ({ ...x, gates: { ...x.gates, [x.scope]: { ...x.gates[x.scope], [g.checkpointId]: e.target.value as CheckpointState } } }))} aria-label={`${g.name} state`} className={SELECT} style={{ color: `var(${GATE_TOK[to]})` }}>
                              {GATE_STATES.map((s) => (
                                <option key={s} value={s}>
                                  {GATE_STATE_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* ── markets & channels ── */}
              <div className="flex min-w-0 flex-col gap-2">
                <span className={`${LABEL} inline-flex items-center gap-1`}>
                  <Layers className="size-3" aria-hidden /> {p.catalog.markets.length ? `Markets · check-ins & ${p.catalog.moduleLabel.toLowerCase()}` : p.catalog.modules.length ? p.catalog.moduleLabel : "Markets"}
                </span>
                {units[0] === null && p.catalog.modules.length === 0 ? (
                  <p className="text-[12px] text-[var(--ink4)]">No markets or {p.catalog.moduleLabel.toLowerCase()} on this project.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {units.map((u) => {
                      const m = marketOf(u);
                      const mc = u ? c.markets[u] : null;
                      const mb = u ? base.markets[u] : null;
                      const touched = mc && mb && (mc.rag !== mb.rag || mc.narrative.trim() !== mb.narrative.trim());
                      return (
                        <li key={u ?? "-"} className={`rounded-[10px] border border-[var(--hair2)] p-2 ${touched ? "border-[var(--brand)]" : ""}`}>
                          {m && mc && (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[11px] font-bold text-[var(--qink)]">
                                  {m.flag ? `${m.flag} ` : ""}
                                  {m.code}
                                </span>
                                <span className="text-[11px] text-[var(--ink4)]">{m.name}</span>
                                <div className="ml-auto flex gap-1" role="radiogroup" aria-label={`${m.name} RAG`}>
                                  {RAGS.map((g) => (
                                    <label key={g} className="cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-semibold has-[:checked]:ring-2 has-[:checked]:ring-[var(--brand)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)]" style={ragChipStyle(g)}>
                                      <input type="radio" name={`mrag-${id}-${u}`} value={g} checked={mc.rag === g} onChange={() => patch(id, (x) => ({ ...x, markets: { ...x.markets, [u!]: { ...x.markets[u!]!, rag: g } } }))} className="sr-only" />
                                      {g}
                                    </label>
                                  ))}
                                </div>
                              </div>
                              <input value={mc.narrative} maxLength={1000} onChange={(e) => patch(id, (x) => ({ ...x, markets: { ...x.markets, [u!]: { ...x.markets[u!]!, narrative: e.target.value } } }))} aria-label={`${m.name} check-in`} placeholder={mc.rag ? "Focus & blockers in this market" : "No check-in yet — pick a RAG and write the focus & blockers"} className={`${INPUT} w-full`} />
                              {mc.rag && !mc.narrative.trim() && <span className="text-[10.5px] text-[var(--warn)]">A check-in needs a line.</span>}
                            </div>
                          )}
                          {p.catalog.modules.length > 0 && (
                            <div className={`flex flex-wrap gap-1 ${m ? "mt-1.5" : ""}`}>
                              {p.catalog.modules.map((mod) => {
                                const k = mkey(mod.id, u);
                                const v = c.modules[k]!;
                                const b = base.modules[k]!;
                                const ch = v.state !== b.state || (v.note ?? null) !== (b.note ?? null);
                                const src = c.fromFile[`module:${k}`];
                                return (
                                  <label key={k} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${ch ? "border-[var(--brand)]" : "border-[var(--hair)]"}`} title={`${mod.name}${ch ? ` · was ${MODULE_STATE_LABEL[b.state]}` : ""}${src ? ` · file: ${src}` : ""}${v.note ? ` — ${v.note}` : ""}`}>
                                    <span className="font-semibold text-[var(--ink2)]">{mod.name}</span>
                                    <select value={v.state} onChange={(e) => patch(id, (x) => ({ ...x, modules: { ...x.modules, [k]: { ...x.modules[k]!, state: e.target.value as InstanceState } } }))} aria-label={`${mod.name}${m ? ` in ${m.name}` : ""} state`} className={`h-5 rounded-[5px] border-0 bg-transparent pr-4 text-[11px] font-bold ${FOCUS}`} style={{ color: `var(${MODULE_TOK[v.state]})` }}>
                                      {MODULE_STATES.map((s) => (
                                        <option key={s} value={s}>
                                          {MODULE_STATE_LABEL[s]}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {/* ── apply bar ── */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--hair)] bg-[var(--cardbg)] px-4 py-3 shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)]">
        <span className="text-[12.5px] text-[var(--ink3)]">
          {changed.length === 0 ? "Edit any card above — gates, channel states, market check-ins, the line for the Head." : `${changed.length} ${changed.length === 1 ? "project" : "projects"} with changes`}
        </span>
        {changed.some((p) => diffs[p.catalog.projectId]!.gates.some((g) => WEIGHT[g.to] < WEIGHT[g.from])) && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--warn)]">
            <AlertTriangle className="size-3.5" aria-hidden /> some gates move backwards
          </span>
        )}
        <button type="button" onClick={() => void apply()} disabled={busy !== null || changed.length === 0} className={`${PRIMARY} ml-auto`}>
          <Send className="size-3.5" aria-hidden /> {busy === "apply" ? "Applying…" : applyLabel()}
        </button>
      </div>
    </div>
  );
}

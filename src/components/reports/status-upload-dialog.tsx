"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, FileText, Flag, Layers, Plus, Upload } from "lucide-react";
import { isoWeekId, isoWeekMonday, shiftIsoWeek, weekRange } from "@/lib/iso-week";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCUS, PRIMARY, QUIET, SECONDARY, ragChipStyle } from "@/lib/surface";
import { GATE_STATE_LABEL, MODULE_STATE_LABEL, resolveDelivery, type CatalogMarket, type DeliveryCatalog, type DeliveryPlan, type ParsedCell, type ParsedGate } from "@/lib/status-report-delivery";
import type { Rag } from "@/server/health";

/**
 * Reports › This week — upload the weekly status report (Word, Excel, PDF or a PowerPoint
 * one-pager per project / per market), review what each row would write, fill it. One
 * card per row: the project (and market) it lands on, the RAG, the update the Head will
 * read, and — from a slide — the delivery it moves: gate states on the Product build track
 * and module states per market, each change ticked before it is applied. Sending stays the
 * queue's own action; a market one-pager saves that market's check-in instead.
 */

interface PreviewRow {
  line: number;
  project: string;
  status: Rag | null;
  stage: string;
  update: string;
  warnings: string[];
  gates: ParsedGate[];
  cells: ParsedCell[];
  dimensions: { name: string; value: string }[];
  sections: { title: string; lines: string[] }[];
  match: { projectId: string | null; confidence: "exact" | "suggested" | "none"; orgUnitId?: string | null };
  alreadySent: boolean;
  delivery: DeliveryPlan | null;
}
interface Preview {
  format: "docx" | "xlsx" | "pdf" | "pptx";
  preparedBy: string | null;
  reportDate: string | null;
  isoWeek: string;
  past: boolean;
  rows: PreviewRow[];
  projects: { id: string; code: string; name: string; markets?: { orgUnitId: string; code: string; name: string }[] }[];
  catalogs: Record<string, DeliveryCatalog>;
  warnings: string[];
  fileName: string;
  base64: string;
}
interface ApplyRow {
  projectId: string;
  code: string;
  outcome: "drafted" | "resent" | "sent" | "market" | "skipped" | "error";
  message?: string;
  attached: boolean;
  market?: string | null;
  gates?: string | null;
  modules?: string | null;
  problems?: string[];
}
interface Draft {
  projectId: string | null;
  /** null = the whole product; a market id = this row is that market's one-pager. */
  orgUnitId: string | null;
  rag: Rag;
  stage: string;
  narrative: string;
  /** Already sent this week → replace it and resend. */
  resend: boolean;
  plan: DeliveryPlan | null;
  /** Ticked changes: checkpointId → on, `${moduleId}:${orgUnitId ?? "-"}` → on. */
  gatesOn: Record<string, boolean>;
  modulesOn: Record<string, boolean>;
}

const RAGS: Rag[] = ["Green", "Amber", "Red"];
const INPUT = `rounded-[8px] border border-[var(--input)] bg-background px-2.5 py-1.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`;
const LABEL = "font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]";
const NARRATIVE_MAX = 500;
const moduleKey = (m: { moduleId: string; orgUnitId: string | null }) => `${m.moduleId}:${m.orgUnitId ?? "-"}`;

type WeekMode = "this" | "last" | "custom";

function planFor(row: PreviewRow, catalog: DeliveryCatalog | undefined, market: CatalogMarket | null | undefined): DeliveryPlan | null {
  if (!catalog) return null;
  return resolveDelivery(row, catalog, market === undefined ? {} : { market });
}
function allOn(plan: DeliveryPlan | null): Pick<Draft, "gatesOn" | "modulesOn"> {
  return {
    gatesOn: Object.fromEntries((plan?.gates ?? []).map((g) => [g.checkpointId, true])),
    modulesOn: Object.fromEntries((plan?.modules ?? []).map((m) => [moduleKey(m), true])),
  };
}

export function StatusUploadDialog({ open, onOpenChange, onApplied }: { open: boolean; onOpenChange: (o: boolean) => void; onApplied: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [catalogs, setCatalogs] = useState<Record<string, DeliveryCatalog>>({});
  // Which week the report is for: this week by default, or a past one.
  const [weekMode, setWeekMode] = useState<WeekMode>("this");
  const [customDate, setCustomDate] = useState("");
  const thisWeek = isoWeekId(new Date());
  const week = weekMode === "this" ? thisWeek : weekMode === "last" ? shiftIsoWeek(thisWeek, -1) : customDate ? isoWeekId(new Date(`${customDate}T12:00:00Z`)) : null;
  const weekPast = Boolean(week && week !== thisWeek);
  const weekLabel = (w: string) => `Week ${w.split("-W")[1]} · ${weekRange(isoWeekMonday(w))}`;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApplyRow[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setCatalogs({});
    setDrafts({});
    setResults(null);
    setError(null);
    setWeekMode("this");
    setCustomDate("");
  };
  const patch = (line: number, p: Partial<Draft>) => setDrafts((all) => ({ ...all, [line]: { ...all[line]!, ...p } }));

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy("read");
    setError(null);
    setResults(null);
    const fd = new FormData();
    fd.append("file", file);
    if (week) fd.append("week", week);
    const res = await fetch("/api/reports/status-upload", { method: "POST", body: fd });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "The file could not be read.");
      return;
    }
    const p = body.data as Preview;
    setPreview(p);
    setCatalogs(p.catalogs);
    setDrafts(
      Object.fromEntries(
        p.rows.map((r) => [
          r.line,
          {
            projectId: r.match.projectId,
            orgUnitId: r.delivery?.market?.orgUnitId ?? r.match.orgUnitId ?? null,
            rag: r.status ?? "Amber",
            stage: r.stage,
            narrative: r.update,
            resend: r.alreadySent,
            plan: r.delivery,
            ...allOn(r.delivery),
          } satisfies Draft,
        ]),
      ),
    );
  }

  /** The PM picked another project or market for a row: re-resolve the slide against it. */
  async function retarget(row: PreviewRow, projectId: string | null, market: CatalogMarket | null | undefined) {
    if (!projectId) {
      patch(row.line, { projectId: null, orgUnitId: null, plan: null, gatesOn: {}, modulesOn: {} });
      return;
    }
    let catalog = catalogs[projectId];
    if (!catalog) {
      const res = await fetch(`/api/reports/status-upload/catalog?project=${projectId}`);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.data) {
        catalog = body.data as DeliveryCatalog;
        setCatalogs((all) => ({ ...all, [projectId]: catalog! }));
      }
    }
    const plan = planFor(row, catalog, market);
    patch(row.line, { projectId, orgUnitId: plan?.market?.orgUnitId ?? (market === undefined ? null : (market?.orgUnitId ?? null)), plan, ...allOn(plan) });
  }

  const chosen = preview ? preview.rows.filter((r) => drafts[r.line]?.projectId && drafts[r.line]!.narrative.trim() && (!r.alreadySent || drafts[r.line]!.resend || drafts[r.line]!.orgUnitId)) : [];
  const resending = chosen.filter((r) => r.alreadySent && !drafts[r.line]!.orgUnitId).length;
  const marketRows = chosen.filter((r) => drafts[r.line]!.orgUnitId).length;
  const gateCount = chosen.reduce((n, r) => n + Object.values(drafts[r.line]!.gatesOn).filter(Boolean).length, 0);
  const moduleCount = chosen.reduce((n, r) => n + Object.values(drafts[r.line]!.modulesOn).filter(Boolean).length, 0);
  // Two rows on the same project AND market (two product slides, or two Rwanda slides) collide.
  const targets = chosen.map((r) => `${drafts[r.line]!.projectId}:${drafts[r.line]!.orgUnitId ?? "-"}`);
  const dupes = new Set(targets.filter((t, i) => targets.indexOf(t) !== i));

  async function apply() {
    if (!preview) return;
    setBusy("apply");
    setError(null);
    const res = await fetch("/api/reports/status-upload/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        week: preview.isoWeek,
        preparedBy: preview.preparedBy,
        reportDate: preview.reportDate,
        rows: chosen.map((r) => {
          const d = drafts[r.line]!;
          return {
            projectId: d.projectId,
            rag: d.rag,
            stage: d.stage.trim(),
            narrative: d.narrative.trim(),
            resend: r.alreadySent && d.resend,
            target: d.orgUnitId ? "market" : "project",
            orgUnitId: d.orgUnitId,
            gates: (d.plan?.gates ?? []).filter((g) => d.gatesOn[g.checkpointId]).map((g) => ({ checkpointId: g.checkpointId, state: g.to })),
            modules: (d.plan?.modules ?? []).filter((m) => d.modulesOn[moduleKey(m)]).map((m) => ({ moduleId: m.moduleId, orgUnitId: m.orgUnitId, state: m.to, note: m.note })),
          };
        }),
        ...(attach ? { file: { name: preview.fileName, format: preview.format, base64: preview.base64 } } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not fill the drafts.");
      return;
    }
    setResults(body.data as ApplyRow[]);
    onApplied();
  }

  const applyLabel = () => {
    const parts: string[] = [];
    const drafted = chosen.length - resending - marketRows;
    if (preview?.past) parts.push(`Send ${chosen.length - marketRows} for Week ${preview.isoWeek.split("-W")[1]}`);
    else {
      if (drafted > 0) parts.push(`Fill ${drafted} ${drafted === 1 ? "draft" : "drafts"}`);
      if (resending > 0) parts.push(`resend ${resending}`);
    }
    if (marketRows > 0) parts.push(`${marketRows} market check-in${marketRows === 1 ? "" : "s"}`);
    if (gateCount > 0) parts.push(`${gateCount} gate${gateCount === 1 ? "" : "s"}`);
    if (moduleCount > 0) parts.push(`${moduleCount} state${moduleCount === 1 ? "" : "s"}`);
    return parts.length ? parts.join(" · ") : "Nothing to fill";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Upload a status report</DialogTitle>
          <DialogDescription>
            A Word, Excel or PDF table (Project · Status · Stage · Update), or a PowerPoint one-pager per project or per market. Each row fills that
            project&apos;s weekly update and moves its delivery — gates and channel states per market — exactly as you tick it here. Nothing goes to the
            Head until you send it; a past week&apos;s report is sent as you review it.
          </DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="flex flex-col items-start gap-3">
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="mb-1.5 text-[12px] font-semibold text-[var(--ink3)]">Report for</legend>
              {(
                [
                  ["this", "This week"],
                  ["last", "Last week"],
                  ["custom", "Past report · pick a date"],
                ] as [WeekMode, string][]
              ).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setWeekMode(m)} aria-pressed={weekMode === m} className={`${weekMode === m ? PRIMARY : SECONDARY} px-3 py-1.5 text-[12.5px]`}>
                  {label}
                </button>
              ))}
              {weekMode === "custom" && (
                <input type="date" value={customDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustomDate(e.target.value)} aria-label="A date in the week the report is for" className={INPUT} />
              )}
            </fieldset>
            <p className="text-[12px] text-[var(--ink4)]">
              {week ? weekLabel(week) : "Pick a date in the week the report is for."}
              {weekPast && " — a past week: rows are sent to the Head as you review them here."}
            </p>
            <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx,.pdf" className="sr-only" aria-label="Status report file" onChange={(e) => void read(e.target.files?.[0])} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null || !week} className={PRIMARY}>
              <Upload className="size-3.5" aria-hidden /> {busy === "read" ? "Reading…" : "Choose file"}
            </button>
            {error && (
              <p role="alert" className="text-[12px] text-[var(--bad)]">
                {error}
              </p>
            )}
          </div>
        )}

        {preview && !results && (
          <div className="flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--ink3)]">
              <FileText className="size-3.5 text-[var(--ink4)]" aria-hidden />
              <b className="text-[var(--qink)]">{preview.fileName}</b>
              {preview.preparedBy && <span>· prepared by {preview.preparedBy}</span>}
              {preview.reportDate && <span>· {preview.reportDate}</span>}
              <span>
                · {preview.rows.length} {preview.rows.length === 1 ? "slide" : "rows"} · {weekLabel(preview.isoWeek)}
              </span>
              {preview.past && <span className="font-semibold text-[var(--warn)]">· past week — sent as reviewed here</span>}
              <button type="button" onClick={reset} className={QUIET}>
                Choose another file
              </button>
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="rounded-[8px] px-3 py-2 text-[12px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>
                {w}
              </p>
            ))}

            {preview.rows.map((r) => {
              const d = drafts[r.line]!;
              const catalog = d.projectId ? catalogs[d.projectId] : undefined;
              const dupe = d.projectId ? dupes.has(`${d.projectId}:${d.orgUnitId ?? "-"}`) : false;
              const market = d.plan?.market ?? null;
              const isMarket = Boolean(d.orgUnitId);
              const gatesOnCount = Object.values(d.gatesOn).filter(Boolean).length;
              const modulesOnCount = Object.values(d.modulesOn).filter(Boolean).length;
              const byMarket = new Map<string, typeof d.plan extends null ? never : NonNullable<typeof d.plan>["modules"]>();
              for (const m of d.plan?.modules ?? []) byMarket.set(m.marketCode ?? "Product", [...(byMarket.get(m.marketCode ?? "Product") ?? []), m]);
              return (
                <section key={r.line} aria-labelledby={`row-${r.line}`} className="rounded-[12px] border border-[var(--hair)] bg-[var(--card2)]">
                  {/* ── header: where this row lands ── */}
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-[var(--hair2)] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={LABEL}>In the file</p>
                      <h3 id={`row-${r.line}`} className="truncate text-[14px] font-semibold text-[var(--qink)]">
                        {r.project}
                        {r.match.confidence === "suggested" && (
                          <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={ragChipStyle("Amber")}>
                            check the project
                          </span>
                        )}
                        {r.match.confidence === "none" && (
                          <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={ragChipStyle("Red")}>
                            no match
                          </span>
                        )}
                      </h3>
                      {r.dimensions.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                          {r.dimensions.map((x) => (
                            <span key={x.name} className="rounded-full border border-[var(--hair)] px-2 py-0.5 text-[var(--ink3)]">
                              {x.name} <b style={{ color: `var(${x.value === "Green" ? "--ok" : x.value === "Red" ? "--bad" : "--warn"})` }}>{x.value}</b>
                            </span>
                          ))}
                        </p>
                      )}
                      {r.warnings.map((w) => (
                        <p key={w} className="mt-1 text-[11px] text-[var(--warn)]">
                          {w}
                        </p>
                      ))}
                      {dupe && <p className="mt-1 text-[11px] text-[var(--bad)]">Two rows land on the same place — change one.</p>}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex flex-col gap-1">
                        <span className={LABEL}>Project</span>
                        <select value={d.projectId ?? ""} onChange={(e) => void retarget(r, e.target.value || null, undefined)} aria-label={`Project for ${r.project}`} className={`${INPUT} w-[220px]`}>
                          <option value="">Skip this row</option>
                          {preview.projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} · {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {catalog && catalog.markets.length > 0 && (
                        <label className="flex flex-col gap-1">
                          <span className={LABEL}>This slide is about</span>
                          <select
                            value={d.orgUnitId ?? ""}
                            onChange={(e) => void retarget(r, d.projectId, e.target.value ? (catalog.markets.find((m) => m.orgUnitId === e.target.value) ?? null) : null)}
                            aria-label={`Market for ${r.project}`}
                            className={`${INPUT} w-[170px]`}
                          >
                            <option value="">Whole product</option>
                            {catalog.markets.map((m) => (
                              <option key={m.orgUnitId} value={m.orgUnitId}>
                                {m.flag ? `${m.flag} ` : ""}
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <fieldset className="flex flex-col gap-1" aria-label={`RAG for ${r.project}`}>
                        <legend className={LABEL}>RAG</legend>
                        <div className="flex gap-1">
                          {RAGS.map((g) => (
                            <label key={g} className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-semibold has-[:checked]:ring-2 has-[:checked]:ring-[var(--brand)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)]" style={ragChipStyle(g)}>
                              <input type="radio" name={`rag-${r.line}`} value={g} checked={d.rag === g} onChange={() => patch(r.line, { rag: g })} className="sr-only" />
                              {g}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                  </div>

                  {d.projectId && (
                    <div className="grid gap-4 px-4 py-3 md:grid-cols-2">
                      {/* ── left: the words ── */}
                      <div className="flex min-w-0 flex-col gap-2">
                        <label className="flex flex-col gap-1">
                          <span className={LABEL}>{isMarket ? `${market?.name ?? "Market"} check-in · focus & blockers` : "Update for the Head"}</span>
                          <textarea value={d.narrative} maxLength={NARRATIVE_MAX} rows={4} onChange={(e) => patch(r.line, { narrative: e.target.value })} aria-label={`Update for ${r.project}`} className={`${INPUT} w-full resize-y`} />
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.sections.map((s) => {
                            const add = s.lines.filter((l) => !/\[(date|name)\]/i.test(l) && !/^owner:/i.test(l)).slice(0, 3).join("; ");
                            const fits = d.narrative.length + add.length + 2 <= NARRATIVE_MAX;
                            return (
                              <button
                                key={s.title}
                                type="button"
                                disabled={!add || !fits || d.narrative.includes(add)}
                                onClick={() => patch(r.line, { narrative: `${d.narrative.trim()}${d.narrative.trim() ? " " : ""}${s.title}: ${add}.` })}
                                title={fits ? `Add: ${add}` : "No room left in the update"}
                                className={`inline-flex items-center gap-1 rounded-full border border-[var(--hair)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink3)] transition-colors hover:border-brand hover:text-brand disabled:opacity-40 ${FOCUS}`}
                              >
                                <Plus className="size-3" aria-hidden /> {s.title}
                              </button>
                            );
                          })}
                          <span className="ml-auto text-[10.5px] tabular-nums text-[var(--ink5)]">
                            {d.narrative.length}/{NARRATIVE_MAX}
                          </span>
                        </div>
                        {!isMarket && (
                          <label className="flex flex-col gap-1">
                            <span className={LABEL}>Status note (stage)</span>
                            <input value={d.stage} maxLength={200} onChange={(e) => patch(r.line, { stage: e.target.value })} aria-label={`Stage for ${r.project}`} className={`${INPUT} w-full`} placeholder="e.g. BRD v1 · in review" />
                          </label>
                        )}
                        {r.alreadySent && !isMarket && (
                          <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--qink)]">
                            <input type="checkbox" checked={d.resend} onChange={(e) => patch(r.line, { resend: e.target.checked })} className="size-3.5 accent-[var(--brand)]" />
                            Replace the sent update &amp; resend
                          </label>
                        )}
                      </div>

                      {/* ── right: the delivery it moves ── */}
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <p className={LABEL}>
                          Delivery · {isMarket ? `${market?.flag ? `${market.flag} ` : ""}${market?.name ?? "market"} only` : catalog && catalog.markets.length > 0 ? "product and every market" : "this project"}
                        </p>
                        {!d.plan || (d.plan.gates.length === 0 && d.plan.modules.length === 0) ? (
                          <p className="text-[12px] text-[var(--ink4)]">
                            {r.gates.length === 0 && r.cells.length === 0
                              ? "Nothing on this row changes gates or channel states."
                              : `Everything this slide says already matches QUBIT${d.plan ? ` (${d.plan.gatesUnchanged + d.plan.modulesUnchanged} items)` : ""}.`}
                          </p>
                        ) : null}

                        {d.plan && d.plan.gates.length > 0 && (
                          <div>
                            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--qink)]">
                              <Flag className="size-3.5 text-[var(--ink4)]" aria-hidden /> {catalog?.templateName ?? "Gates"} · {gatesOnCount} of {d.plan.gates.length}
                              <button type="button" onClick={() => patch(r.line, { gatesOn: Object.fromEntries(d.plan!.gates.map((g) => [g.checkpointId, gatesOnCount !== d.plan!.gates.length])) })} className={`${QUIET} ml-auto`}>
                                {gatesOnCount === d.plan.gates.length ? "Untick all" : "Tick all"}
                              </button>
                            </p>
                            <ul className="flex flex-col gap-1">
                              {d.plan.gates.map((g) => (
                                <li key={g.checkpointId} className="rounded-[8px] bg-background/70 px-2 py-1.5">
                                  <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                                    <input type="checkbox" checked={Boolean(d.gatesOn[g.checkpointId])} onChange={(e) => patch(r.line, { gatesOn: { ...d.gatesOn, [g.checkpointId]: e.target.checked } })} className="size-3.5 accent-[var(--brand)]" />
                                    <b className="w-[84px] shrink-0 truncate text-[var(--qink)]">{g.name}</b>
                                    <span className="text-[var(--ink4)]">{GATE_STATE_LABEL[g.from]}</span>
                                    <span aria-hidden className="text-[var(--ink5)]">
                                      →
                                    </span>
                                    <span className="font-semibold" style={{ color: `var(${g.to === "Done" ? "--ok" : g.to === "InProgress" ? "--qinfo" : "--ink3"})` }}>
                                      {GATE_STATE_LABEL[g.to]}
                                    </span>
                                  </label>
                                  <p className="ml-[22px] text-[10.5px] text-[var(--ink4)]">
                                    slide: {g.source}
                                    {g.blockedWanted && (
                                      <span className="ml-1 inline-flex items-center gap-1 text-[var(--warn)]">
                                        <AlertTriangle className="size-3" aria-hidden /> says blocked — link a blocker in the register to mark it
                                      </span>
                                    )}
                                  </p>
                                </li>
                              ))}
                            </ul>
                            {d.plan.gatesUnchanged > 0 && <p className="mt-1 text-[10.5px] text-[var(--ink5)]">{d.plan.gatesUnchanged} already as the slide says.</p>}
                          </div>
                        )}

                        {d.plan && d.plan.modules.length > 0 && (
                          <div>
                            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--qink)]">
                              <Layers className="size-3.5 text-[var(--ink4)]" aria-hidden /> {catalog?.moduleLabel ?? "Modules"} · {modulesOnCount} of {d.plan.modules.length}
                              <button type="button" onClick={() => patch(r.line, { modulesOn: Object.fromEntries(d.plan!.modules.map((m) => [moduleKey(m), modulesOnCount !== d.plan!.modules.length])) })} className={`${QUIET} ml-auto`}>
                                {modulesOnCount === d.plan.modules.length ? "Untick all" : "Tick all"}
                              </button>
                            </p>
                            <ul className="flex flex-col gap-1.5">
                              {[...byMarket.entries()].map(([code, list]) => (
                                <li key={code} className="rounded-[8px] bg-background/70 px-2 py-1.5">
                                  <p className="mb-1 font-mono text-[10.5px] font-bold text-[var(--ink3)]">
                                    {catalog?.markets.find((m) => m.code === code)?.flag ?? ""} {code}
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {list.map((m) => {
                                      const k = moduleKey(m);
                                      const on = Boolean(d.modulesOn[k]);
                                      return (
                                        <label
                                          key={k}
                                          title={`${m.source}${m.note ? ` — ${m.note}` : ""}`}
                                          className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--brand)] ${on ? "border-[var(--brand)] text-[var(--qink)]" : "border-[var(--hair)] text-[var(--ink4)] line-through"}`}
                                        >
                                          <input type="checkbox" checked={on} onChange={(e) => patch(r.line, { modulesOn: { ...d.modulesOn, [k]: e.target.checked } })} className="sr-only" />
                                          {on && <Check className="size-3 text-[var(--brand)]" aria-hidden />}
                                          <b>{m.name}</b>
                                          {m.from === m.to ? (
                                            // Same state, new note ("LIVE | not yet actively used").
                                            <span>
                                              {MODULE_STATE_LABEL[m.to]} · <i className="text-[var(--ink3)]">{m.note}</i>
                                            </span>
                                          ) : (
                                            <span>
                                              {MODULE_STATE_LABEL[m.from]} → <b style={{ color: `var(${m.to === "Live" ? "--ok" : m.to === "UAT" ? "--warn" : m.to === "Build" ? "--qinfo" : "--ink3"})` }}>{MODULE_STATE_LABEL[m.to]}</b>
                                            </span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </li>
                              ))}
                            </ul>
                            {d.plan.modulesUnchanged > 0 && <p className="mt-1 text-[10.5px] text-[var(--ink5)]">{d.plan.modulesUnchanged} already as the slide says.</p>}
                          </div>
                        )}
                        {d.plan && d.plan.unmatched.length > 0 && <p className="text-[10.5px] text-[var(--ink5)]">Not placed: {d.plan.unmatched.join(" · ")}</p>}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink2)]">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="size-3.5 accent-[var(--brand)]" />
                Attach the file to each project&apos;s Documents
              </label>
              <button type="button" onClick={() => void apply()} disabled={busy !== null || chosen.length === 0 || dupes.size > 0} className={`${PRIMARY} ml-auto`}>
                {busy === "apply" ? "Applying…" : applyLabel()}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-[12px] text-[var(--bad)]">
                {error}
              </p>
            )}
          </div>
        )}

        {results && (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {results.map((r, i) => {
                const good = r.outcome !== "skipped" && r.outcome !== "error";
                const title =
                  r.outcome === "drafted"
                    ? "Draft filled — in the queue"
                    : r.outcome === "resent"
                      ? "Replaced & resent to the Head"
                      : r.outcome === "sent"
                        ? "Sent to the Head"
                        : r.outcome === "market"
                          ? `${r.market} check-in saved`
                          : (r.message ?? "Skipped");
                return (
                  <li key={`${r.projectId}:${r.market ?? "-"}:${i}`} className="rounded-[12px] border border-[var(--hair)] bg-[var(--card2)] px-4 py-3">
                    <p className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-mono text-[11px] font-semibold text-[var(--ink3)]">
                        {r.code}
                        {r.market ? ` · ${r.market}` : ""}
                      </span>
                      <span className="font-semibold" style={{ color: good ? "var(--ok)" : r.outcome === "skipped" ? "var(--warn)" : "var(--bad)" }}>
                        {title}
                      </span>
                    </p>
                    {good && (
                      <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-[var(--ink3)]">
                        {r.gates && (
                          <li className="flex items-center gap-1.5">
                            <Flag className="size-3 text-[var(--ink4)]" aria-hidden /> Gates: {r.gates}
                          </li>
                        )}
                        {r.modules && (
                          <li className="flex items-center gap-1.5">
                            <Layers className="size-3 text-[var(--ink4)]" aria-hidden /> Channel states: {r.modules}
                          </li>
                        )}
                        {r.attached && (
                          <li className="flex items-center gap-1.5">
                            <FileText className="size-3 text-[var(--ink4)]" aria-hidden /> Report attached to Documents
                          </li>
                        )}
                      </ul>
                    )}
                    {r.problems?.map((p) => (
                      <p key={p} className="mt-1 text-[11.5px] text-[var(--bad)]">
                        {p}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
            {preview?.past ? (
              <p className="text-[12.5px] text-[var(--ink3)]">
                Those rows are now in Week {preview.isoWeek.split("-W")[1]}&apos;s inbox and roll-up.{" "}
                <Link href={`/reports?week=${preview.isoWeek}`} className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline">
                  Open that week →
                </Link>
              </p>
            ) : (
              <p className="text-[12.5px] text-[var(--ink3)]">
                Filled lines sit in the queue with their RAG — check each and press Confirm &amp; send, or Confirm &amp; send all. Market check-ins and delivery changes are already on the
                workspace.
              </p>
            )}
            <div>
              <button type="button" onClick={() => onOpenChange(false)} className={SECONDARY}>
                Back to the queue
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Ban, Check, ChevronDown, ChevronUp, CircleDot, FileText, Plus, Send } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Choice, Field, FIELD_INPUT, FIELD_TEXTAREA, Kv } from "@/components/ui/drawer";
import { Chip, HealthPill, type ChipTone } from "@/components/ui/status-pill";
import { TEXT_LINK } from "@/components/ui/text-link";
import { FilterSelect } from "@/components/list/list-toolbar";
import { FOCUS, PRIMARY, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { GATE_STATE_LABEL, MODULE_STATE_LABEL, type CatalogMarket } from "@/lib/status-report-delivery";
import type { CheckpointState } from "@/server/checkpoints";
import { cascadePlan } from "@/lib/gate-approval";
import type { InstanceState } from "@/server/project-instances";
import { GATE_STATES, MODULE_STATES, NARRATIVE_MAX, RAG_TONE, RAG_WORD, RAGS, mkey, progressOf, readStage, type Card, type Diff, type WorkspaceProject, needsRatingReason, RATING_REASON_MIN } from "@/components/reports/status-workspace-model";

/**
 * Reports › Weekly Update — one project's card (design spec v2, `.mp` + `.gaterow` + `.kv`
 * + `.f` + `.actbar`): name and status chip, a row of gate chips (each opens its state
 * menu), the per-market key/value panel, the Status choice and the Line for the Head, then
 * Save Draft · Confirm & Send. Stage, market check-ins and channel states edit in place
 * under "Edit Stage, Markets and Channels".
 */

const GATE_TONE: Record<CheckpointState, ChipTone> = { Done: "ok", InProgress: "warn", Blocked: "bad", NotStarted: "muted" };
const GATE_ICON: Record<CheckpointState, typeof Check | null> = { Done: Check, InProgress: CircleDot, Blocked: Ban, NotStarted: null };
const GATE_CHIP = "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold";
const GATE_TONE_CLASS: Record<ChipTone, string> = {
  ok: "bg-[var(--ds-okw)] text-[var(--ds-ok-text)]",
  warn: "bg-[var(--ds-warnw)] text-[var(--ds-warn-text)]",
  bad: "bg-[var(--ds-badw)] text-[var(--ds-bad-text)]",
  info: "bg-[var(--ds-infow)] text-[var(--ds-info-text)]",
  vio: "bg-[var(--ds-viow)] text-[var(--ds-vio-text)]",
  teal: "bg-[var(--ds-tealw)] text-[var(--ds-teal-text)]",
  muted: "bg-[var(--ds-mutedw)] text-[var(--ds-ink3)]",
};
const SMALL_SELECT = `h-7 rounded-[var(--ds-radius-compact)] border border-[var(--ds-line)] bg-[var(--ds-card)] px-2 text-[12px] font-semibold text-[var(--ds-ink)] ${FOCUS}`;
const PILL_BTN = `inline-flex items-center gap-1 rounded-full border border-[var(--ds-line)] bg-[var(--ds-card)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ds-ink2)] transition-colors hover:border-[var(--ds-brand)] hover:text-[var(--ds-brand-ink)] disabled:opacity-40 disabled:hover:border-[var(--ds-line)] disabled:hover:text-[var(--ds-ink2)] ${FOCUS}`;
const MENU = "min-w-[180px] rounded-[12px] bg-[var(--ds-card)] p-1.5 text-[var(--ds-ink)] shadow-[var(--ds-shadow-menu)] ring-1 ring-[var(--ds-line)]";
const MENU_ITEM = "rounded-[8px] px-[9px] py-[7px] pr-8 text-[12.5px] data-checked:bg-[var(--ds-brand-wash)] data-checked:font-bold data-checked:text-[var(--ds-brand-ink)]";

export interface CardNotice {
  tone: "ok" | "bad" | "warn";
  text: string;
}

export function UpdateCard({
  p,
  c,
  base,
  d,
  past,
  busy,
  locked,
  notice,
  tenantName,
  teaching,
  onPatch,
  onStage,
  onTeach,
  onSave,
  onSend,
}: {
  p: WorkspaceProject;
  c: Card;
  base: Card;
  d: Diff;
  past: boolean;
  busy: "save" | "send" | null;
  /** Another write is running on the page. */
  locked: boolean;
  notice?: CardNotice;
  tenantName: string;
  teaching: string | null;
  onPatch: (fn: (c: Card) => Card) => void;
  /** Re-read the stage line: a typed line, or the PM's answer to "which gate is this?". */
  onStage: (stageGateName?: string | null, stage?: string) => void;
  onTeach: (term: string, gateName: string | null) => void;
  onSave: () => void;
  onSend: () => void;
}) {
  const id = p.catalog.projectId;
  const [more, setMore] = useState(false);
  const scopeStates = c.gates[c.scope]!;
  const baseScope = base.gates[c.scope]!;
  const pNow = progressOf(Object.values(baseScope));
  const pNext = progressOf(Object.values(scopeStates));
  const units: (string | null)[] = p.catalog.markets.length ? p.catalog.markets.map((m) => m.orgUnitId) : [null];
  const marketOf = (u: string | null): CatalogMarket | null => p.catalog.markets.find((m) => m.orgUnitId === u) ?? null;
  // A closed week has no drafts: its line goes with Confirm & Send, so Save Draft keeps the rest.
  const saveable = d.count - (past && d.product ? 1 : 0);
  const canSend = Boolean(c.narrative.trim()) && (!p.product.alreadySent || c.resend);
  const moreChanged = d.stage || d.markets.length > 0 || d.modules.length > 0;
  const moreLabel = ["Stage", p.catalog.markets.length ? "Markets" : null, p.catalog.modules.length ? "Channels" : null].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " and $1");

  const kvRows: [string, React.ReactNode][] = [
    ...p.catalog.markets.map((m): [string, React.ReactNode] => {
      const mc = c.markets[m.orgUnitId];
      const mb = base.markets[m.orgUnitId];
      const edited = mc && mb && (mc.rag !== mb.rag || mc.narrative.trim() !== mb.narrative.trim());
      const live = p.catalog.modules.filter((mod) => c.modules[mkey(mod.id, m.orgUnitId)]?.state === "Live").length;
      return [
        `${m.flag ? `${m.flag} ` : ""}${m.name}`,
        <span key={m.orgUnitId} className="flex flex-wrap items-center gap-1.5">
          {mc?.rag ? <HealthPill value={mc.rag} /> : <Chip tone="warn">No check-in yet</Chip>}
          <span className="text-[12px] font-normal text-[var(--ds-ink3)]">
            {mc?.rag ? (edited ? "edited here" : "checked in") : null}
            {p.catalog.modules.length > 0 && `${mc?.rag ? " · " : ""}${live} of ${p.catalog.modules.length} live`}
          </span>
        </span>,
      ];
    }),
    ["Status", `Computed: ${RAG_WORD[p.product.computedRag].toLowerCase()}`],
    ["Progress", pNext !== pNow ? `${pNow}% → ${pNext}%` : `${pNow}%`],
    ["Sent", p.product.alreadySent ? "Sent this week" : p.product.status === "Draft" ? "Not yet · draft saved" : "Not yet"],
  ];

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[var(--ds-radius-card)] border border-[var(--ds-bd)] px-[18px] py-4 shadow-[var(--ds-shadow)]" style={{ background: "var(--ds-card)" }} aria-labelledby={`card-${id}`}>
      {/* header: name + status chip */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <h2 id={`card-${id}`} className="text-[16px] font-bold text-[var(--ds-ink)]">
            {p.catalog.name}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--ds-ink3)]">
            {p.catalog.code} · {p.catalog.templateName ?? "No gate template"}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">
          {d.count > 0 && <Chip tone="info">{d.count === 1 ? "1 unsaved change" : `${d.count} unsaved changes`}</Chip>}
          <HealthPill value={c.rag} />
        </div>
      </div>

      {/* gate chips */}
      {p.catalog.gates.length === 0 ? (
        <p className="text-[12px] text-[var(--ds-ink3)]">No gate template on this project. Pick one in the project workspace.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {p.catalog.markets.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Gates"
                allLabel="Product · every market"
                value={c.scope === "-" ? "" : c.scope}
                options={p.catalog.markets.map((m) => ({ value: m.orgUnitId, label: `${m.flag ? `${m.flag} ` : ""}${m.name} only` }))}
                onChange={(v) => onPatch((x) => ({ ...x, scope: v || "-" }))}
              />
            </div>
          )}
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`Gates for ${p.catalog.name}`}>
            {p.catalog.gates.map((g) => {
              const to = scopeStates[g.checkpointId]!;
              const from = baseScope[g.checkpointId]!;
              const src = c.fromFile[`gate:${c.scope}:${g.checkpointId}`];
              const Icon = GATE_ICON[to];
              const changed = to !== from;
              const chipInner = (
                <>
                  {Icon && <Icon className="size-3" aria-hidden />}
                  {g.name}
                  {src && <FileText className="size-3 opacity-70" aria-hidden />}
                  <span className="sr-only">
                    : {GATE_STATE_LABEL[to].toLowerCase()}
                    {changed ? `, was ${GATE_STATE_LABEL[from].toLowerCase()}` : ""}
                    {src ? ", from the file" : ""}
                  </span>
                </>
              );
              const title = `${g.name}: ${GATE_STATE_LABEL[to].toLowerCase()}${changed ? ` (was ${GATE_STATE_LABEL[from].toLowerCase()})` : ""}${src ? ` · file: ${src}` : ""}`;
              return (
                <li key={g.checkpointId}>
                  {from === "Blocked" ? (
                    <span className={cn(GATE_CHIP, GATE_TONE_CLASS.bad)} title={`${g.name}: blocked`}>
                      {chipInner}
                    </span>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger title={title} className={cn(GATE_CHIP, GATE_TONE_CLASS[GATE_TONE[to]], changed && "ring-2 ring-inset ring-[var(--ds-brand)]", "cursor-pointer", FOCUS)}>
                        {chipInner}
                        <ChevronDown className="size-[11px] opacity-70" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className={MENU}>
                        <DropdownMenuRadioGroup
                          value={to}
                          onValueChange={(v) =>
                            onPatch((x) => {
                              const state = String(v) as CheckpointState;
                              const scoped = { ...x.gates[x.scope], [g.checkpointId]: state };
                              // A later gate done closes the earlier ones (a PM can reopen one explicitly after).
                              // WS1: a sign-off gate set done is submitted on save, and the cascade stops
                              // at the first open sign-off gate behind it (which is proposed done = submitted).
                              if (state === "Done" && !g.signOff) {
                                const plan = cascadePlan(
                                  p.catalog.gates.map((e) => ({ checkpointId: e.checkpointId, orderIndex: e.orderIndex, state: scoped[e.checkpointId] ?? "NotStarted", signOff: Boolean(e.signOff), approval: p.catalog.gateStates.find((s) => s.orgUnitId === (x.scope === "-" ? null : x.scope) && s.checkpointId === e.checkpointId)?.approval })),
                                  g.checkpointId,
                                );
                                for (const id of [...plan.close, ...(plan.submit ? [plan.submit] : [])]) scoped[id] = "Done";
                              }
                              return { ...x, gates: { ...x.gates, [x.scope]: scoped } };
                            })
                          }
                        >
                          {GATE_STATES.map((s) => (
                            <DropdownMenuRadioItem key={s} value={s} className={MENU_ITEM}>
                              {GATE_STATE_LABEL[s]}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Kv rows={kvRows} />

      <div className="flex flex-col gap-[5px]">
        <span className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">
          Status{c.fromFile.rag ? <span className="font-normal"> · from the file</span> : c.rag !== p.product.computedRag ? <span className="font-normal"> · QUBIT calculates {RAG_WORD[p.product.computedRag].toLowerCase()}</span> : null}
        </span>
        <Choice label={`Status for ${p.catalog.name}`} rag value={c.rag} options={RAGS.map((r) => ({ value: r, label: RAG_WORD[r], tone: RAG_TONE[r] }))} onChange={(r) => onPatch((x) => ({ ...x, rag: r }))} />
        {needsRatingReason(p, c) && (
          <Field label="Why your rating differs" hint={`The Head sees this. At least ${RATING_REASON_MIN} characters.`}>
            <textarea value={c.ratingReason} maxLength={300} rows={2} onChange={(e) => onPatch((x) => ({ ...x, ratingReason: e.target.value }))} placeholder="For example: the blocker clears on Monday; the vendor confirmed" className={FIELD_TEXTAREA} />
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-[5px]">
        <label htmlFor={`line-${id}`} className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">
          Line for the Head{c.fromFile.narrative && <span className="font-normal"> · from the file</span>}
        </label>
        <textarea id={`line-${id}`} value={c.narrative} maxLength={NARRATIVE_MAX} rows={3} onChange={(e) => onPatch((x) => ({ ...x, narrative: e.target.value }))} placeholder="What leadership should know this week" className={cn(FIELD_TEXTAREA, "resize-y")} />
        <div className="flex flex-wrap items-center gap-1.5">
          {c.sources.map((s, i) => {
            const add = s.lines.filter((l) => !/\[(date|name)\]/i.test(l) && !/^owner:/i.test(l)).slice(0, 3).join("; ");
            const fits = c.narrative.length + add.length + s.title.length + 4 <= NARRATIVE_MAX;
            return (
              <button key={`${s.title}-${i}`} type="button" disabled={!add || !fits || c.narrative.includes(add)} onClick={() => onPatch((x) => ({ ...x, narrative: `${x.narrative.trim()}${x.narrative.trim() ? " " : ""}${s.title}: ${add}.` }))} title={fits ? `Add: ${add}` : "No room left"} className={PILL_BTN}>
                <Plus className="size-3" aria-hidden /> {s.title}
              </button>
            );
          })}
          <span className="ml-auto text-[11.5px] tabular-nums text-[var(--ds-ink3)]">
            {c.narrative.length}/{NARRATIVE_MAX}
          </span>
        </div>
        {p.product.alreadySent && (
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--ds-ink)]">
            <input type="checkbox" checked={c.resend} onChange={(e) => onPatch((x) => ({ ...x, resend: e.target.checked }))} className="size-3.5 accent-[var(--ds-brand)]" />
            Replace the sent line and resend
          </label>
        )}
      </div>

      {/* stage, market check-ins and channel states */}
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className={cn(TEXT_LINK, "self-start")}>
          {more ? <ChevronUp className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
          Edit {moreLabel}
          {moreChanged && !more && <span className="font-normal text-[var(--ds-ink3)]">&nbsp;· changed</span>}
        </button>
        {more && (
          <div className="flex flex-col gap-3 rounded-[var(--ds-radius-kv)] border border-[var(--ds-line)] p-3">
            <Field label={<>Stage{c.fromFile.stage && <span className="font-normal"> · from the file</span>}</>}>
              <input value={c.stage} maxLength={200} onChange={(e) => onStage(undefined, e.target.value)} placeholder="For example: UAT · pilot readiness" className={FIELD_INPUT} />
            </Field>
            {c.stage.trim() && <StageReadingRow p={p} base={base} c={c} tenantName={tenantName} teaching={teaching} onStage={onStage} onTeach={onTeach} />}
            {(units[0] !== null || p.catalog.modules.length > 0) && (
              <ul className="m-0 flex list-none flex-col p-0">
                {units.map((u) => {
                  const m = marketOf(u);
                  const mc = u ? c.markets[u] : null;
                  return (
                    <li key={u ?? "-"} className="flex flex-col gap-2 border-b border-dotted border-[var(--ds-line)] py-2.5 first:pt-0 last:border-b-0 last:pb-0">
                      {m && mc && (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <b className="text-[13px] font-semibold text-[var(--ds-ink)]">
                              {m.flag ? `${m.flag} ` : ""}
                              {m.name}
                            </b>
                            <Choice label={`${m.name} status`} rag value={mc.rag} options={RAGS.map((r) => ({ value: r, label: RAG_WORD[r], tone: RAG_TONE[r] }))} onChange={(r) => onPatch((x) => ({ ...x, markets: { ...x.markets, [u!]: { ...x.markets[u!]!, rag: r } } }))} />
                          </div>
                          <input value={mc.narrative} maxLength={1000} onChange={(e) => onPatch((x) => ({ ...x, markets: { ...x.markets, [u!]: { ...x.markets[u!]!, narrative: e.target.value } } }))} aria-label={`${m.name} check-in`} placeholder={mc.rag ? "Focus and blockers in this market" : "No check-in yet: pick a status and write the focus and blockers"} className={FIELD_INPUT} />
                          {mc.rag && !mc.narrative.trim() && <span className="text-[12px] text-[var(--ds-warn-text)]">A check-in needs a line.</span>}
                        </>
                      )}
                      {p.catalog.modules.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.catalog.modules.map((mod) => {
                            const k = mkey(mod.id, u);
                            const v = c.modules[k]!;
                            const b = base.modules[k]!;
                            const ch = v.state !== b.state || (v.note ?? null) !== (b.note ?? null);
                            const src = c.fromFile[`module:${k}`];
                            return (
                              <label key={k} className={cn("inline-flex items-center gap-1.5 rounded-[var(--ds-radius-compact)] bg-[var(--ds-surface2)] py-0.5 pl-2 pr-0.5 text-[12px] text-[var(--ds-ink2)]", ch && "ring-2 ring-inset ring-[var(--ds-brand)]")} title={`${mod.name}${ch ? ` · was ${MODULE_STATE_LABEL[b.state]}` : ""}${src ? ` · file: ${src}` : ""}${v.note ? ` · ${v.note}` : ""}`}>
                                {mod.name}
                                <select value={v.state} onChange={(e) => onPatch((x) => ({ ...x, modules: { ...x.modules, [k]: { ...x.modules[k]!, state: e.target.value as InstanceState } } }))} aria-label={`${mod.name}${m ? ` in ${m.name}` : ""} state`} className={SMALL_SELECT}>
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
        )}
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {notice && (
          <span role={notice.tone === "bad" ? "alert" : "status"} className={cn("mr-auto text-[12px] font-semibold", notice.tone === "ok" ? "text-[var(--ds-ok-text)]" : notice.tone === "warn" ? "text-[var(--ds-warn-text)]" : "text-[var(--ds-bad-text)]")}>
            {notice.text}
          </span>
        )}
        <button type="button" onClick={onSave} disabled={locked || saveable === 0} className={SECONDARY} title={past && d.product ? "A past week's line is sent with Confirm & Send" : undefined}>
          {busy === "save" ? "Saving…" : "Save Draft"}
        </button>
        <button type="button" onClick={onSend} disabled={locked || !canSend} className={PRIMARY} title={p.product.alreadySent && !c.resend ? "Already sent this week. Tick Replace to resend it." : !c.narrative.trim() ? "Write the line for the Head first" : undefined}>
          <Send className="size-3.5" aria-hidden /> {busy === "send" ? "Sending…" : p.product.alreadySent ? "Confirm & Resend" : "Confirm & Send"}
        </button>
      </div>
    </section>
  );
}

/** How the stage line reads as a gate, with the PM's answer and phrases QUBIT can remember. */
function StageReadingRow({ p, base, c, tenantName, teaching, onStage, onTeach }: { p: WorkspaceProject; base: Card; c: Card; tenantName: string; teaching: string | null; onStage: (stageGateName?: string | null) => void; onTeach: (term: string, gateName: string | null) => void }) {
  const reading = readStage(p, base, c, c.stageGateName).reading;
  const known = p.catalog.stageTerms ?? [];
  const clauses = (reading?.clauses ?? []).filter((cl) => !known.some((t) => t.term === cl.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-[var(--ds-surface2)] px-3 py-2.5 text-[12.5px] text-[var(--ds-ink2)]">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Stage reads as
          {reading?.matched && (
            <span className="text-[var(--ds-ink3)]">
              {" "}
              (from “{reading.matched}”{reading.learned ? ", learned" : ""})
            </span>
          )}
        </span>
        <select value={c.stageGateName === undefined ? (reading?.gateName ?? "") : (c.stageGateName ?? "")} onChange={(e) => onStage(e.target.value || null)} aria-label={`Gate for the stage of ${p.catalog.name}`} className={SMALL_SELECT}>
          <option value="">Not a gate</option>
          {p.catalog.gates.map((g) => (
            <option key={g.checkpointId} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
        {reading?.state && reading.gateName && <span className="text-[var(--ds-ink3)]">{GATE_STATE_LABEL[reading.state].toLowerCase()}, earlier gates done</span>}
      </div>
      {reading?.gateName && clauses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[var(--ds-ink3)]">
          Remember for {tenantName || "everyone"}:
          {clauses.map((cl) => (
            <button key={cl} type="button" disabled={teaching !== null} onClick={() => onTeach(cl, reading.gateName)} className={PILL_BTN} title={`“${cl}” will always read as ${reading.gateName}`}>
              <Plus className="size-3" aria-hidden /> “{cl}” = {reading.gateName}
            </button>
          ))}
        </div>
      )}
      {reading && !reading.gateName && clauses.length > 0 && <span className="text-[var(--ds-warn-text)]">New words. Pick the gate they mean and QUBIT can remember them.</span>}
    </div>
  );
}

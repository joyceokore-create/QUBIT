"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/ui/status-pill";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { paginate } from "@/lib/list-state";
import { FOCUS } from "@/lib/surface";
import { GATE_KEYS, type GateState } from "@/lib/cockpit-gates";
import {
  GATE_FILTER_KEYS,
  GATE_STATE_WORD,
  GATE_VIEW_LABELS,
  HEALTH_LABEL,
  HEALTH_ORDER,
  NONE,
  filterGateRows,
  stageOptions,
  type GateFilters,
  type GateViewRow,
} from "@/lib/project-gate-view";

/**
 * UX8 — Projects › Gate view: the stage-gate tracker on the shared list kit. One row per
 * project; a project in several markets shows its furthest-behind market (tagged, linking to
 * its Delivery tab for per-market detail). ~40 bounded rows, so it pages in the browser.
 */

// Each cell is a glyph in a tinted disc plus a screen-reader word (U4: never colour alone).
const CELL: Record<GateState, { glyph: string; ink: string; filled: boolean }> = {
  done: { glyph: "✓", ink: "--ok-ink", filled: true },
  prog: { glyph: "●", ink: "--qinfo", filled: true },
  late: { glyph: "!", ink: "--warn-ink", filled: true },
  block: { glyph: "✕", ink: "--bad-ink", filled: true },
  none: { glyph: "", ink: "--ink3", filled: false },
};
const LEGEND_ORDER: GateState[] = ["done", "prog", "late", "block", "none"];

function GateDot({ state }: { state: GateState }) {
  const c = CELL[state];
  return (
    <span
      aria-hidden
      className="inline-grid size-[22px] place-items-center rounded-full text-[11.5px] font-bold leading-none"
      style={
        c.filled
          ? { color: `var(${c.ink})`, background: `color-mix(in oklab, var(${c.ink}) 14%, transparent)` }
          : { border: "1.5px solid color-mix(in oklab, var(--ink3) 45%, transparent)" }
      }
    >
      {c.glyph}
    </span>
  );
}

function GateCell({ gate, state }: { gate: string; state: GateState | null }) {
  if (!state) {
    return (
      <span title="This project's template has no such gate" className="text-[var(--ink3)]">
        <span aria-hidden>—</span>
        <span className="sr-only">Not on this template</span>
      </span>
    );
  }
  return (
    <span title={`${gate}: ${GATE_STATE_WORD[state]}`} className="inline-flex">
      <GateDot state={state} />
      <span className="sr-only">{GATE_STATE_WORD[state]}</span>
    </span>
  );
}

const FILTER_LABEL: Record<(typeof GATE_FILTER_KEYS)[number], string> = { pm: "PM", priority: "Priority", stage: "Stage", health: "Health" };

const options = (values: (string | null)[], noneLabel: string): FilterOption[] => {
  const set = [...new Set(values.map((v) => v ?? NONE))].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)));
  return set.map((v) => ({ value: v, label: v === NONE ? noneLabel : v }));
};

export function ProjectsGateView({ rows: all, canCreate }: { rows: GateViewRow[]; canCreate: boolean }) {
  const { openProject } = usePanel();
  const list = useListUrl("projects-gates", 10);
  const f = Object.fromEntries(GATE_FILTER_KEYS.map((k) => [k, list.get(k)])) as GateFilters;

  const opts = useMemo(
    () => ({
      pm: options(all.map((r) => r.pm), "No PM"),
      priority: options(all.map((r) => r.priority), "None"),
      stage: stageOptions(all.map((r) => r.track.stage)).map((s) => ({ value: s, label: s })),
      health: HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_LABEL[h] })),
    }),
    [all],
  );

  const filtered = useMemo(
    () => filterGateRows(all, list.q, { pm: f.pm, priority: f.priority, stage: f.stage, health: f.health }),
    [all, list.q, f.pm, f.priority, f.stage, f.health],
  );
  const { rows, info } = paginate(filtered, list.page, list.size);

  const labelOf = (key: keyof typeof opts, v: string) => opts[key].find((o) => o.value === v)?.label ?? v;
  const active: ActiveFilter[] = GATE_FILTER_KEYS.filter((k) => f[k]).map((k) => ({ key: k, label: `${FILTER_LABEL[k]}: ${labelOf(k, f[k])}` }));
  const isFiltered = active.length > 0 || !!list.q;

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search projects or PMs" label="Search projects" />
          <FilterSelect label="Project manager" allLabel="All PMs" value={f.pm} options={opts.pm} onChange={(v) => list.set({ pm: v })} />
          <FilterSelect label="Priority" allLabel="All priorities" value={f.priority} options={opts.priority} onChange={(v) => list.set({ priority: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Health" allLabel="All health" value={f.health} options={opts.health} onChange={(v) => list.set({ health: v })} />
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...GATE_FILTER_KEYS])} />
        </ListToolbar>
      </div>

      <TableCard
        footer={
          <>
            <GateLegend />
            <TableFooter info={info} noun="projects" onPage={list.setPage} onSize={list.setSize} />
          </>
        }
      >
        {rows.length === 0 ? (
          <ListEmpty
            filtered={isFiltered}
            noun="projects"
            onClear={() => list.clear([...GATE_FILTER_KEYS])}
            hint={isFiltered ? undefined : "Gates appear once a project is on a checkpoint template."}
            action={
              canCreate && (
                <Button variant="outline" nativeButton={false} render={<Link href="/projects/new" />}>
                  <Plus /> New project
                </Button>
              )
            }
          />
        ) : (
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <caption className="sr-only">
              Stage gates per project. A project in several markets shows its furthest-behind market.
            </caption>
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Project</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">PM</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
                {GATE_KEYS.map((k) => (
                  <th key={k} scope="col" className="px-1.5 py-2.5 text-center font-semibold">
                    {GATE_VIEW_LABELS[k]}
                  </th>
                ))}
                <th scope="col" className="w-[130px] px-3 py-2.5 font-semibold">Progress</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = r.track;
                const pctTitle = `${t.pct}% complete (the whole project)`;
                return (
                  <tr
                    key={r.id}
                    onClick={() => openProject(r.id)}
                    className="cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="max-w-[300px] px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openProject(r.id);
                        }}
                        className="block max-w-full truncate rounded-sm text-left font-semibold text-[var(--qink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                      >
                        {r.name}
                      </button>
                      <span className="block truncate text-[12px] text-[var(--ink3)]">
                        <span className="font-mono text-[11.5px]">{r.code}</span> · {r.priority} priority
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{r.pm ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">
                      <span className="flex items-center gap-1.5">
                        {t.stage}
                        {t.market && (
                          <Link
                            href={`/projects/${r.id}?tab=Delivery`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Showing ${t.market.name}, the furthest-behind of ${t.marketCount} markets. Open the Delivery tab for every market.`}
                            className={`inline-flex h-[18px] items-center rounded-[5px] bg-[var(--surface-2)] px-1.5 text-[10.5px] font-bold tracking-[.04em] text-[var(--ink2)] hover:text-[var(--qink)] ${FOCUS}`}
                          >
                            {t.market.code}
                            <span className="sr-only">
                              {" "}
                              ({t.market.name}, furthest behind of {t.marketCount} markets; open its Delivery tab)
                            </span>
                          </Link>
                        )}
                      </span>
                    </td>
                    {GATE_KEYS.map((k) => (
                      <td key={k} className="px-1.5 py-2.5 text-center">
                        <GateCell gate={GATE_VIEW_LABELS[k]} state={t.gates ? t.gates[k] : null} />
                      </td>
                    ))}
                    <td className="px-3 py-2.5" title={pctTitle}>
                      <span className="flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
                          <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${t.pct}%` }} />
                        </span>
                        <span className="w-[34px] text-right text-[12px] tabular-nums text-[var(--ink2)]">{t.pct}%</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5" title={r.health === "None" ? "No confirmed weekly report yet" : "This week's confirmed status"}>
                      {r.health === "None" ? <span className="text-[12px] font-semibold text-[var(--ink3)]">No report</span> : <HealthPill value={r.health} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </>
  );
}

/** Key to the gate cells — every state named, plus "—" for gates a template doesn't have. */
function GateLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border)] px-4 py-2.5 text-[12px] text-[var(--ink3)]">
      <span className="font-semibold text-[var(--ink2)]">Gates</span>
      {LEGEND_ORDER.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <GateDot state={s} />
          {GATE_STATE_WORD[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-grid w-[22px] place-items-center">—</span>
        Not on this template
      </span>
    </div>
  );
}

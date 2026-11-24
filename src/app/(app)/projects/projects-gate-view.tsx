"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";
import { Button } from "@/components/ui/button";
import { Chip, HealthPill } from "@/components/ui/status-pill";
import { Meter } from "@/components/ui/kpi-charts";
import { Foot } from "@/components/ui/panel";
import { Drawer, DrawerFooter, DrawerFrame, DrawerHeader, DrawerText, Kv } from "@/components/ui/drawer";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { paginate } from "@/lib/list-state";
import { FOCUS, PRIMARY, THEAD, TROW } from "@/lib/surface";
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

// Design spec v2 gate cells (`.gc`): 16px squares, radius 5 — done green, in progress blue,
// overdue amber, blocked red, not started muted with a line ring. Each also carries a word for
// screen readers and a tooltip (U4: never colour alone).
const CELL: Record<GateState, string> = {
  done: "var(--ds-ok)",
  // Design `.gc`: in progress amber, overdue red (the workspace's Gates by Market uses the
  // same fills). Blocked shares overdue's red; each cell also carries its word.
  prog: "var(--ds-warn)",
  late: "var(--ds-bad)",
  block: "var(--ds-bad)",
  none: "var(--ds-mutedw)",
};
const LEGEND_ORDER: GateState[] = ["done", "prog", "late", "none"];

function GateSquare({ state, size = 16 }: { state: GateState; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block align-middle"
      style={{ width: size, height: size, borderRadius: size > 12 ? 5 : 3, background: CELL[state], boxShadow: state === "none" ? "inset 0 0 0 1px var(--ds-line)" : undefined }}
    />
  );
}

type OpenGate = { row: GateViewRow; key: (typeof GATE_KEYS)[number]; state: GateState };

function GateCell({ gate, state, onOpen }: { gate: string; state: GateState | null; onOpen: () => void }) {
  if (!state) {
    return (
      <span title="This project's template has no such gate" className="text-[var(--ds-ink3)]">
        <span aria-hidden>—</span>
        <span className="sr-only">Not on this template</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      title={`${gate}: ${GATE_STATE_WORD[state]}`}
      aria-label={`${gate}: ${GATE_STATE_WORD[state]}. Open the gate`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`inline-grid size-6 place-items-center rounded-[6px] hover:bg-[var(--ds-surface2)] ${FOCUS}`}
    >
      <GateSquare state={state} />
      <span className="sr-only">{GATE_STATE_WORD[state]}</span>
    </button>
  );
}

const HEALTH_METER = { Green: "ok", Amber: "warn", Red: "bad" } as const;

const FILTER_LABEL: Record<(typeof GATE_FILTER_KEYS)[number], string> = { pm: "PM", priority: "Priority", stage: "Stage", health: "Status" };

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
  const [openGate, setOpenGate] = useState<OpenGate | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search projects or PMs" label="Search projects" />
          <FilterSelect label="PM" allLabel="All PMs" value={f.pm} options={opts.pm} onChange={(v) => list.set({ pm: v })} />
          <FilterSelect label="Priority" allLabel="All priorities" value={f.priority} options={opts.priority} onChange={(v) => list.set({ priority: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Status" allLabel="All statuses" value={f.health} options={opts.health} onChange={(v) => list.set({ health: v })} />
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
                  <Plus /> New Project
                </Button>
              )
            }
          />
        ) : (
          <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-[12.5px]">
            <caption className="sr-only">
              Stage gates per project. A project in several markets shows its furthest-behind market.
            </caption>
            <thead className={THEAD}>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">PM</th>
                <th scope="col">Stage</th>
                {GATE_KEYS.map((k) => (
                  <th key={k} scope="col" className="!text-center">
                    {GATE_VIEW_LABELS[k]}
                  </th>
                ))}
                <th scope="col" className="w-[130px]">Progress</th>
                <th scope="col">Status</th>
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
                    className={`${TROW} cursor-pointer hover:[&>td]:bg-[var(--ds-surface2)]`}
                  >
                    <td className="max-w-[300px]">
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
                    <td className="whitespace-nowrap text-[var(--ds-ink2)]">{r.pm ?? "No PM"}</td>
                    <td className="whitespace-nowrap text-[var(--ds-ink2)]">
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
                      <td key={k} className="text-center">
                        <GateCell gate={GATE_VIEW_LABELS[k]} state={t.gates ? t.gates[k] : null} onOpen={() => t.gates && setOpenGate({ row: r, key: k, state: t.gates[k] })} />
                      </td>
                    ))}
                    <td title={pctTitle}>
                      <span className="flex items-center gap-2">
                        <Meter value={t.pct} max={100} tone={r.health === "None" ? "info" : HEALTH_METER[r.health as keyof typeof HEALTH_METER] ?? "info"} className="min-w-[70px] flex-1" />
                        <span className="w-[34px] text-right text-[12px] tabular-nums text-[var(--ds-ink2)]">{t.pct}%</span>
                      </span>
                    </td>
                    <td title={r.health === "None" ? "No confirmed weekly report yet" : "This week's confirmed status"}>
                      {r.health === "None" ? <Chip>No report</Chip> : <HealthPill value={r.health} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
      <GateDrawer open={openGate} onClose={() => setOpenGate(null)} />
    </>
  );
}

/** A gate cell opened in the drawer: its state and where it stands; changes are made (and
 * audited) in the project's Delivery tab, per track and market. */
function GateDrawer({ open, onClose }: { open: OpenGate | null; onClose: () => void }) {
  return (
    <Drawer open={!!open} onClose={onClose}>
      {open && (
        <DrawerFrame
          header={<DrawerHeader step={`Gate · ${GATE_VIEW_LABELS[open.key]}`} title={open.row.name} subtitle={[open.row.pm ? `PM ${open.row.pm}` : "No PM", `${open.row.priority} priority`].join(" · ")} />}
          footer={
            <DrawerFooter>
              <Link href={`/projects/${open.row.id}?tab=Delivery`} className={PRIMARY}>
                Update in Delivery
              </Link>
            </DrawerFooter>
          }
        >
          <div className="flex items-center gap-2.5 text-[13px] text-[var(--ds-ink2)]">
            <GateSquare state={open.state} />
            <b className="font-semibold text-[var(--ds-ink)]">{GATE_STATE_WORD[open.state]}</b>
          </div>
          <Kv
            rows={[
              ["Current stage", open.row.track.stage],
              ["Progress", `${open.row.track.pct}%`],
              ["Market", open.row.track.market ? `${open.row.track.market.name} (furthest behind of ${open.row.track.marketCount})` : "Single track"],
              ["Status", open.row.health === "None" ? "No report" : open.row.health === "Green" ? "On track" : open.row.health === "Amber" ? "At risk" : "Off track"],
            ]}
          />
          <DrawerText hint>Gates are set per track and market in the project&apos;s Delivery tab, where every change is audited. Sign-off for gates that need approval comes with the gate workflow.</DrawerText>
        </DrawerFrame>
      )}
    </Drawer>
  );
}

/** Key to the gate cells (`.foot` + `.legend-g`), every state named. */
function GateLegend() {
  return (
    <Foot action={<span>Click a gate to open it.</span>}>
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {LEGEND_ORDER.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <GateSquare state={st} size={11} />
            {st === "late" ? "Overdue or blocked" : GATE_STATE_WORD[st]}
          </span>
        ))}
        <span>— not on this template</span>
      </span>
    </Foot>
  );
}

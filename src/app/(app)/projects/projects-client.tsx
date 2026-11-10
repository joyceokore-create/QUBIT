"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { usePanel } from "@/components/panels/panel-context";
import { ExportButton } from "@/components/export-button";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/ui/status-pill";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, FilterToggle, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { matchesSearch, paginate } from "@/lib/list-state";
import { COCKPIT_PHASES } from "@/lib/cockpit-gates";
import { RAG_TOKEN } from "@/lib/surface";
import { healthWord } from "@/lib/status-words";
import { TabStrip } from "@/components/ui/tab-strip";
import { HEALTH_LABEL, HEALTH_ORDER, healthOf, type GateViewRow, type HealthBucket } from "@/lib/project-gate-view";
import { ProjectsGateView } from "./projects-gate-view";

// docs/38 milestone 2 — a project's STATUS is its confirmed weekly check-in, not the typed
// lifecycle field. No confirmed report this week reads "No report" (neutral), never a
// misleading Green.
//
// UX5 (L1–L5): the shared header / toolbar / always-visible pagination, all state in the URL.
// ~40 bounded rows, health is worked out in code, so it loads once and pages in the browser.
//
// UX8 — List · Gate view tabs share this header; the Gate view lives in projects-gate-view.tsx.

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  type: string;
  priority: string;
  status: string;
  dueDate: string | null;
  budget: string | null;
  avgProgress: number;
  memberCount: number;
  /** The viewer leads this project or is allocated to it — powers the Mine filter. */
  isMine: boolean;
  portfolio: string | null;
  pm: string | null;
  /** Phase from the project's real gates (stageOf): Planning · Execution · … · Not gated. */
  stage: string;
  /** DM1.73 (Wave C, C4): this week's check-in, or null when none exists yet. */
  checkin: { rag: "Green" | "Amber" | "Red"; confirmed: boolean } | null;
}

const FILTER_KEYS = ["portfolio", "pm", "stage", "health", "priority", "mine"] as const;
const NONE = "__none";

const options = (values: (string | null)[], noneLabel: string): FilterOption[] => {
  const set = [...new Set(values.map((v) => v ?? NONE))].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)));
  return set.map((v) => ({ value: v, label: v === NONE ? noneLabel : v }));
};

export function ProjectsClient({
  projects,
  canCreate,
  tenantName,
  view,
  gateRows,
}: {
  projects: ProjectRow[];
  canCreate: boolean;
  tenantName: string;
  view: "list" | "gates";
  gateRows: GateViewRow[];
}) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        eyebrow={tenantName}
        title="Projects"
        description={
          view === "gates"
            ? `${projects.length} projects. Gates come from checkpoint records; a project in several markets shows its furthest-behind market.`
            : `${projects.length} projects. Health is this week's confirmed check-in.`
        }
        actions={
          <>
            <ExportButton href="/api/export?kind=projects" />
            {canCreate && (
              <Button nativeButton={false} render={<Link href="/projects/new" />}>
                <Plus /> New project
              </Button>
            )}
          </>
        }
      />

      <TabStrip
        label="Project views"
        active={view}
        tabs={[
          { key: "list", label: "List", href: "/projects" },
          { key: "gates", label: "Gate view", href: "/projects?view=gates" },
        ]}
      />

      {view === "gates" ? <ProjectsGateView rows={gateRows} canCreate={canCreate} /> : <ProjectsListView projects={projects} canCreate={canCreate} />}
    </main>
  );
}

function ProjectsListView({ projects, canCreate }: { projects: ProjectRow[]; canCreate: boolean }) {
  const { openProject } = usePanel();
  const list = useListUrl("projects", 10);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, list.get(k)])) as Record<(typeof FILTER_KEYS)[number], string>;

  // A row's health: the CONFIRMED check-in's RAG, else "None" (no report yet).
  const health = (p: ProjectRow): HealthBucket => healthOf(p.checkin);

  const opts = useMemo(
    () => ({
      portfolio: options(projects.map((p) => p.portfolio), "No portfolio"),
      pm: options(projects.map((p) => p.pm), "No PM"),
      stage: COCKPIT_PHASES.filter((s) => projects.some((p) => p.stage === s)).map((s) => ({ value: s, label: s })),
      health: HEALTH_ORDER.map((h) => ({ value: h, label: HEALTH_LABEL[h] })),
      priority: options(projects.map((p) => p.priority), "None"),
    }),
    [projects],
  );

  const eq = (value: string | null, filter: string) => !filter || (value ?? NONE) === filter;
  const filtered = useMemo(
    () =>
      projects
        .filter(
          (p) =>
            matchesSearch(list.q, p.name, p.code, p.pm, p.portfolio) &&
            eq(p.portfolio, f.portfolio) &&
            eq(p.pm, f.pm) &&
            eq(p.stage, f.stage) &&
            eq(health(p), f.health) &&
            eq(p.priority, f.priority) &&
            (f.mine !== "1" || p.isMine),
        )
        .sort((a, b) => HEALTH_ORDER.indexOf(health(a)) - HEALTH_ORDER.indexOf(health(b)) || a.name.localeCompare(b.name)),
    [projects, list.q, f.portfolio, f.pm, f.stage, f.health, f.priority, f.mine],
  );
  const { rows, info } = paginate(filtered, list.page, list.size);

  const labelOf = (key: keyof typeof opts, v: string) => opts[key].find((o) => o.value === v)?.label ?? v;
  const active: ActiveFilter[] = [
    ...(["portfolio", "pm", "stage", "health", "priority"] as const)
      .filter((k) => f[k])
      .map((k) => ({ key: k, label: `${{ portfolio: "Portfolio", pm: "PM", stage: "Stage", health: "Health", priority: "Priority" }[k]}: ${labelOf(k, f[k])}` })),
    ...(f.mine === "1" ? [{ key: "mine", label: "Mine" }] : []),
  ];
  const isFiltered = active.length > 0 || !!list.q;
  const mineCount = projects.filter((p) => p.isMine).length;

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search projects, codes or PMs" label="Search projects" />
          <FilterSelect label="Portfolio" allLabel="All portfolios" value={f.portfolio} options={opts.portfolio} onChange={(v) => list.set({ portfolio: v })} />
          <FilterSelect label="Project manager" allLabel="All PMs" value={f.pm} options={opts.pm} onChange={(v) => list.set({ pm: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Health" allLabel="All health" value={f.health} options={opts.health} onChange={(v) => list.set({ health: v })} />
          <FilterSelect label="Priority" allLabel="All priorities" value={f.priority} options={opts.priority} onChange={(v) => list.set({ priority: v })} />
          <span data-tour="mine" title="Projects you lead or are allocated to">
            <FilterToggle label="Mine" count={mineCount} pressed={f.mine === "1"} onChange={(on) => list.set({ mine: on ? "1" : null })} />
          </span>
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
      </div>

      <TableCard footer={<TableFooter info={info} noun="projects" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty
            filtered={isFiltered}
            noun="projects"
            onClear={() => list.clear([...FILTER_KEYS])}
            action={
              canCreate && (
                <Button variant="outline" nativeButton={false} render={<Link href="/projects/new" />}>
                  <Plus /> New project
                </Button>
              )
            }
          />
        ) : (
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="w-[76px] px-4 py-2.5 font-semibold">Code</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Project</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">PM</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
                <th scope="col" className="w-[150px] px-3 py-2.5 font-semibold">Progress</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Health</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Check-in</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Team</th>
                <th scope="col" className="w-8 px-2"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const h = health(p);
                return (
                  <tr
                    key={p.id}
                    onClick={() => openProject(p.id)}
                    className="cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 font-mono text-[11.5px] text-[var(--ink3)]">{p.code}</td>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openProject(p.id);
                        }}
                        className="block max-w-full truncate rounded-sm text-left font-semibold text-[var(--qink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                      >
                        {p.name}
                      </button>
                      <span className="block truncate text-[12px] text-[var(--ink3)]">
                        {p.portfolio ?? "No portfolio"} · {p.priority} priority
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{p.pm ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{p.stage}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${p.avgProgress}%` }} />
                        </span>
                        <span className="w-[34px] text-right text-[12px] tabular-nums text-[var(--ink2)]">{p.avgProgress}%</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5" title={h === "None" ? "No confirmed weekly report yet" : "This week's confirmed status"}>
                      {h === "None" ? <span className="text-[12px] font-semibold text-[var(--ink3)]">No report</span> : <HealthPill value={h} />}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5" title="This week's check-in">
                      {p.checkin ? (
                        <span className="flex items-center gap-1.5 text-[12px]">
                          <span className="size-2 flex-none rounded-full" style={{ background: `var(${RAG_TOKEN[p.checkin.rag]})` }} aria-hidden />
                          <span className={p.checkin.confirmed ? "text-[var(--ink3)]" : "font-semibold text-[var(--warn-ink)]"}>
                            {p.checkin.confirmed ? "Confirmed" : `Draft: ${healthWord(p.checkin.rag)}`}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[var(--ink3)]">None this week</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--ink2)]">{p.memberCount}</td>
                    <td className="px-2 py-2.5">
                      <ChevronRight className="size-4 text-[var(--ink3)]" aria-hidden />
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

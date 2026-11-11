"use client";

import type { ReactNode } from "react";
import { FilterChips, FilterSelect, FilterToggle, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { RiskTable } from "@/components/raid/risk-table";
import { IssueTable } from "@/components/raid/issue-table";
import { GapReportTable } from "@/components/raid/gap-report-view";
import type { PageInfo } from "@/lib/list-state";
import type { RiskListItem } from "@/server/risks";
import type { IssuePageRow } from "@/server/issues";
import type { RaidFacets, RaidTab } from "@/server/raid";
import type { AdminUserSummary } from "@/server/users";

// UX5 (L1–L5) — Risks & Issues toolbar and table card. The server pages, searches and
// filters (listRisksPage / listIssuesPage); this writes the view into the URL, which
// re-renders the server component with the new slice.

const FILTER_KEYS = ["project", "severity", "status", "owner"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABEL: Record<FilterKey, string> = { project: "Project", severity: "Severity", status: "Status", owner: "Owner" };

const TAB_COPY: Record<RaidTab, { noun: string; search: string; searchLabel: string; hint: string }> = {
  risks: {
    noun: "risks",
    search: "Search risks, mitigations, projects or owners",
    searchLabel: "Search risks",
    hint: "Risks you raise appear here with their severity, owner and mitigation.",
  },
  issues: {
    noun: "issues",
    search: "Search issues by ID or title",
    searchLabel: "Search issues",
    hint: "Issues appear when a risk is materialised or an issue is raised.",
  },
  gap: {
    noun: "gaps",
    search: "Search issues, risks, projects or owners",
    searchLabel: "Search the gap report",
    hint: "Every issue traces back to an owned, mitigated risk.",
  },
};

type Rows = { tab: "risks"; rows: RiskListItem[] } | { tab: "issues"; rows: IssuePageRow[] } | { tab: "gap"; rows: IssuePageRow[] };

export function RisksClient({
  data,
  info,
  facets,
  statuses,
  severities,
  canUpdate,
  viewerId,
  users,
  createAction,
}: {
  data: Rows;
  info: PageInfo;
  facets: RaidFacets;
  statuses: readonly string[];
  severities: readonly string[];
  canUpdate: boolean;
  viewerId: string;
  users: AdminUserSummary[];
  /** "+ New risk" for the empty Risks tab, when the viewer may create. */
  createAction?: ReactNode;
}) {
  const { tab } = data;
  const copy = TAB_COPY[tab];
  const list = useListUrl(`raid-${tab}`, 10);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, list.get(k)])) as Record<FilterKey, string>;

  const withCurrent = (options: FilterOption[], value: string, unknown: string): FilterOption[] =>
    value && !options.some((o) => o.value === value) ? [...options, { value, label: unknown }] : options;

  const opts: Record<FilterKey, FilterOption[]> = {
    project: withCurrent(
      [...facets.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })), ...(facets.hasNoProject ? [{ value: "none", label: "No project" }] : [])],
      f.project,
      "Unknown project",
    ),
    severity: severities.map((s) => ({ value: s, label: s })),
    status: statuses.map((s) => ({ value: s, label: s === "notclosed" ? "Not closed" : s })),
    owner: withCurrent(
      [
        ...facets.owners.map((o) => ({ value: o.id, label: o.id === viewerId ? `${o.name} (you)` : o.name })),
        ...(facets.hasUnowned ? [{ value: "none", label: "Unowned" }] : []),
      ],
      f.owner,
      f.owner === viewerId ? "You" : "Unknown owner",
    ),
  };

  const labelOf = (k: FilterKey, v: string) => opts[k].find((o) => o.value === v)?.label ?? v;
  const active: ActiveFilter[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({ key: k, label: `${FILTER_LABEL[k]}: ${labelOf(k, f[k])}` }));
  const isFiltered = active.length > 0 || !!list.q;
  const clearAll = () => list.clear([...FILTER_KEYS]);

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar label={`Search and filter ${copy.noun}`}>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder={copy.search} label={copy.searchLabel} className="sm:w-[340px]" />
          <FilterSelect label="Project" allLabel="All projects" value={f.project} options={opts.project} onChange={(v) => list.set({ project: v })} />
          <FilterSelect label="Severity" allLabel="All severities" value={f.severity} options={opts.severity} onChange={(v) => list.set({ severity: v })} />
          <FilterSelect label="Status" allLabel="All statuses" value={f.status} options={opts.status} onChange={(v) => list.set({ status: v })} />
          <FilterSelect label="Owner" allLabel="All owners" value={f.owner} options={opts.owner} onChange={(v) => list.set({ owner: v })} />
          <span title={`${copy.noun[0].toUpperCase()}${copy.noun.slice(1)} you own`}>
            <FilterToggle label="Mine" count={facets.mine} pressed={f.owner === viewerId} onChange={(on) => list.set({ owner: on ? viewerId : null })} />
          </span>
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={clearAll} />
        </ListToolbar>
      </div>

      <TableCard footer={<TableFooter info={info} noun={copy.noun} onPage={list.setPage} onSize={list.setSize} />}>
        {data.rows.length === 0 ? (
          <ListEmpty
            filtered={isFiltered}
            noun={copy.noun}
            onClear={clearAll}
            hint={isFiltered ? undefined : copy.hint}
            action={tab === "risks" ? createAction : undefined}
          />
        ) : data.tab === "risks" ? (
          <RiskTable risks={data.rows} users={users} canUpdate={canUpdate} viewerId={viewerId} />
        ) : data.tab === "issues" ? (
          <IssueTable issues={data.rows} users={users} canUpdate={canUpdate} />
        ) : (
          <GapReportTable rows={data.rows} />
        )}
      </TableCard>
    </>
  );
}

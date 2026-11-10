"use client";

import { useMemo } from "react";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { matchesSearch, paginate } from "@/lib/list-state";
import { WORKLOAD_BUCKETS, WORKLOAD_LABEL, workloadBucket } from "@/lib/list-buckets";
import { formatDayMonth } from "@/lib/dates";

/**
 * People › Directory — everyone with their project allocations. DM1.73: shows the
 * leave-aware effectivePct alongside the booked totalPct, badges people away today, and
 * sorts by effectivePct descending so over-allocated people surface first.
 *
 * UX5 (L1–L5): toolbar (search + Department · Team · Workload) outside the card, always-
 * visible pagination, view state in the URL. The directory is bounded by headcount and the
 * effective figure is worked out in code, so it loads once and pages in the browser.
 */

export interface DirectoryPerson {
  userId: string;
  name: string;
  email: string;
  departmentName: string | null;
  teams: string[];
  totalPct: number;
  effectivePct: number;
  /** ISO date while they are away today, else null. */
  onLeaveUntil: string | null;
  allocations: { projectCode: string; projectName: string; role: string; allocationPct: number | null }[];
}

const FILTER_KEYS = ["department", "team", "workload"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABEL: Record<FilterKey, string> = { department: "Department", team: "Team", workload: "Workload" };
const NONE = "__none";

const options = (values: (string | null)[], noneLabel: string): FilterOption[] =>
  [...new Set(values.map((v) => v ?? NONE))]
    .sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)))
    .map((v) => ({ value: v, label: v === NONE ? noneLabel : v }));

export function PeopleDirectory({ people, timeZone }: { people: DirectoryPerson[]; timeZone: string }) {
  const list = useListUrl("people-directory", 10);
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, list.get(k)])) as Record<FilterKey, string>;

  const opts = useMemo<Record<FilterKey, FilterOption[]>>(
    () => ({
      department: options(people.map((p) => p.departmentName), "No department"),
      team: options(people.flatMap((p) => (p.teams.length ? p.teams : [null])), "No team"),
      workload: WORKLOAD_BUCKETS.map((b) => ({ value: b, label: WORKLOAD_LABEL[b] })),
    }),
    [people],
  );
  // A tenant with no teams at all gets no Team filter (it could only say "No team").
  const hasTeams = people.some((p) => p.teams.length > 0);

  const filtered = useMemo(
    () =>
      people
        .filter(
          (p) =>
            matchesSearch(list.q, p.name, p.email, ...p.allocations.flatMap((a) => [a.projectName, a.projectCode])) &&
            (!f.department || (p.departmentName ?? NONE) === f.department) &&
            (!f.team || (f.team === NONE ? p.teams.length === 0 : p.teams.includes(f.team))) &&
            (!f.workload || workloadBucket(p.effectivePct) === f.workload),
        )
        .sort((a, b) => b.effectivePct - a.effectivePct || a.name.localeCompare(b.name)),
    [people, list.q, f.department, f.team, f.workload],
  );
  const { rows, info } = paginate(filtered, list.page, list.size);

  const active: ActiveFilter[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({
    key: k,
    label: `${FILTER_LABEL[k]}: ${opts[k].find((o) => o.value === f[k])?.label ?? f[k]}`,
  }));
  const isFiltered = active.length > 0 || !!list.q;

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search people, emails or projects" label="Search people" />
          <FilterSelect label="Department" allLabel="All departments" value={f.department} options={opts.department} onChange={(v) => list.set({ department: v })} />
          {(hasTeams || f.team) && <FilterSelect label="Team" allLabel="All teams" value={f.team} options={opts.team} onChange={(v) => list.set({ team: v })} />}
          <FilterSelect label="Workload" allLabel="Any workload" value={f.workload} options={opts.workload} onChange={(v) => list.set({ workload: v })} />
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
      </div>

      <TableCard footer={<TableFooter info={info} noun="people" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty filtered={isFiltered} noun="people" onClear={() => list.clear([...FILTER_KEYS])} hint={isFiltered ? undefined : "People appear here once they are invited or imported in Admin."} />
        ) : (
          <table className="relative w-full min-w-[860px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Person</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Department</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Projects</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.userId} className="border-b border-[var(--border)] align-top transition-colors last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="max-w-[300px] px-4 py-2.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-semibold text-[var(--qink)]">{p.name}</span>
                      {p.onLeaveUntil && (
                        <span className="flex-none rounded-full bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--warn-ink)]">
                          On leave until {formatDayMonth(p.onLeaveUntil, timeZone)}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--ink3)]">{p.email}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-[var(--ink2)]">{p.departmentName ?? "—"}</span>
                    {p.teams.length > 0 && <span className="block text-[12px] text-[var(--ink3)]">{p.teams.join(", ")}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.allocations.length === 0 ? (
                      <span className="text-[var(--ink3)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {p.allocations.map((a) => (
                          <span
                            key={`${a.projectCode}-${a.role}`}
                            className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[12px] text-[var(--ink2)]"
                            title={`${a.role}${a.allocationPct != null ? ` · ${a.allocationPct}%` : ""}`}
                          >
                            {a.projectName} · {a.role}
                            {a.allocationPct != null ? ` (${a.allocationPct}%)` : ""}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: p.effectivePct > 100 ? "var(--bad-ink)" : "var(--ink2)" }}
                      title={p.effectivePct > 100 ? "Over-allocated (leave-aware)" : "Effective allocation over the next fortnight, leave-aware"}
                    >
                      {p.effectivePct}%
                    </span>
                    {p.effectivePct !== p.totalPct && (
                      <span className="block text-[12px] tabular-nums text-[var(--ink3)]" title="Booked allocation before leave is applied">
                        {p.totalPct}% booked
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </>
  );
}

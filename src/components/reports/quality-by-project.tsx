"use client";

import { usePanel } from "@/components/panels/panel-context";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { paginate } from "@/lib/list-state";
import { coverageLabel, filterQualityRows, type QualityRow } from "@/lib/quality-report";

/**
 * UX9 (D13) — Reports › Quality › "Quality by project", on the shared list kit: search,
 * one filter (In testing / All), always-visible pagination (10 by default). One row per
 * active project — bounded, so it pages in the browser. Rows arrive sorted most critical
 * first (src/lib/quality-report.ts); filtering keeps that order.
 */

const FILTER_KEY = "show";

function Count({ n, tone }: { n: number; tone?: "bad" | "warn" }) {
  if (n === 0) return <span className="tabular-nums text-[var(--ink3)]">0</span>;
  const color = tone === "bad" ? "var(--bad-ink)" : tone === "warn" ? "var(--warn-ink)" : "var(--qink)";
  return (
    <span className="font-semibold tabular-nums" style={{ color }}>
      {n}
    </span>
  );
}

function Coverage({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="text-[var(--ink3)]" title="No accepted requirements to cover">
        <span aria-hidden>—</span>
        <span className="sr-only">No requirements</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2" title={`${pct}% of accepted requirements have linked tests`}>
      <span className="h-1 w-[56px] flex-none overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
        <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-[36px] text-right text-[12px] tabular-nums text-[var(--ink2)]">{coverageLabel(pct)}</span>
    </span>
  );
}

export function QualityByProject({ rows: all }: { rows: QualityRow[] }) {
  const { openProject } = usePanel();
  const list = useListUrl("reports-quality", 10);
  const show = list.get(FILTER_KEY) === "testing" ? "testing" : "";
  const filtered = filterQualityRows(all, list.q, show);
  const { rows, info } = paginate(filtered, list.page, list.size);
  const active: ActiveFilter[] = show ? [{ key: FILTER_KEY, label: "Showing: In testing" }] : [];
  const isFiltered = active.length > 0 || !!list.q;

  return (
    <section aria-labelledby="quality-by-project" className="flex flex-col gap-3">
      <h2 id="quality-by-project" className="text-[15px] font-semibold text-[var(--qink)]">
        Quality by project
      </h2>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search projects, codes or PMs" label="Search projects" />
          <FilterSelect
            label="Show"
            allLabel="All projects"
            value={show}
            options={[{ value: "testing", label: "In testing" }]}
            onChange={(v) => list.set({ [FILTER_KEY]: v })}
          />
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([FILTER_KEY])} />
        </ListToolbar>
      </div>

      <TableCard footer={<TableFooter info={info} noun="projects" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty
            filtered={isFiltered}
            noun="projects"
            onClear={() => list.clear([FILTER_KEY])}
            hint={isFiltered ? undefined : "Active projects appear here with their test coverage, critical issues and test work."}
          />
        ) : (
          <table className="w-full min-w-[920px] text-left text-[13px]">
            <caption className="sr-only">
              Quality by active project, most critical first. Open bugs are High, Medium and Low; Critical bugs count under Open critical.
            </caption>
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Project</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">PM</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Coverage</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Open critical</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold" title="Open bugs by severity: High / Medium / Low">
                  Open bugs <span className="normal-case tracking-normal">H/M/L</span>
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Overdue test tasks</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unassigned test tasks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
                    <span className="block truncate font-mono text-[11.5px] text-[var(--ink3)]">{r.code}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">{r.pmName ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink2)]">
                    <span className="flex items-center gap-1.5">
                      {r.stage ?? <span className="text-[var(--ink3)]">No gates</span>}
                      {r.inTesting && (
                        <span className="inline-flex h-[18px] items-center rounded-[5px] bg-[color-mix(in_oklab,var(--qinfo)_14%,transparent)] px-1.5 text-[10.5px] font-bold tracking-[.04em] text-[var(--qinfo)]">
                          In testing
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Coverage pct={r.coveragePct} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Count n={r.criticalOpen} tone="bad" />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--ink2)]">
                    <span aria-hidden>
                      {r.openBugs.high} / {r.openBugs.medium} / {r.openBugs.low}
                    </span>
                    <span className="sr-only">
                      {r.openBugs.high} high, {r.openBugs.medium} medium, {r.openBugs.low} low
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Count n={r.overdueTests} tone="warn" />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Count n={r.unassignedTests} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </section>
  );
}

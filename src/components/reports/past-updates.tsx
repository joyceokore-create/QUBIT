"use client";

import Link from "next/link";
import { useMemo } from "react";
import { HealthPill } from "@/components/ui/status-pill";
import { FilterChips, FilterSelect, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { formatDayMonth } from "@/lib/dates";
import { matchesSearch, paginate } from "@/lib/list-state";
import { FOCUS, THEAD } from "@/lib/surface";
import type { PastUpdateRow } from "@/server/past-updates";

/** UX12 (D13, L1–L3) — the PM's past weekly updates: Project and Week filters, search,
 * always-visible pagination (default 5). "pu*" URL keys so they don't clash with /reports'. */
export function PastUpdates({ rows, timeZone }: { rows: PastUpdateRow[]; timeZone: string }) {
  const list = useListUrl("past-updates", 5);
  const project = list.get("puproject");
  const week = list.get("puweek");
  const projects = useMemo(() => [...new Map(rows.map((r) => [r.projectId, r.projectName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const weeks = useMemo(() => [...new Set(rows.map((r) => r.isoWeek))], [rows]);
  const shown = rows.filter((r) => (!project || r.projectId === project) && (!week || r.isoWeek === week) && matchesSearch(list.q, r.projectName, r.projectCode, r.narrative));
  const { rows: page, info } = paginate(shown, list.page, list.size);
  const chips = [
    ...(project ? [{ key: "puproject", label: `Project: ${projects.find(([id]) => id === project)?.[1] ?? "?"}` }] : []),
    ...(week ? [{ key: "puweek", label: `Week ${week.split("-W")[1]}` }] : []),
  ];
  const filtered = chips.length > 0 || !!list.q;

  return (
    <section aria-labelledby="past-updates" className="flex flex-col gap-3">
      <h2 id="past-updates" className="text-[15px] font-semibold text-[var(--qink)]">
        Past updates
      </h2>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(v) => list.set({ q: v })} placeholder="Search your updates" label="Search past updates" />
          <FilterSelect label="Project" allLabel="All projects" value={project} options={projects.map(([value, label]) => ({ value, label }))} onChange={(v) => list.set({ puproject: v })} />
          <FilterSelect label="Week" allLabel="All weeks" value={week} options={weeks.map((w) => ({ value: w, label: `Week ${w.split("-W")[1]} · ${w.split("-W")[0]}` }))} onChange={(v) => list.set({ puweek: v })} />
          <FilterChips filters={chips} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear(["puproject", "puweek"])} />
        </ListToolbar>
      </div>
      <TableCard footer={<TableFooter info={info} noun="updates" onPage={list.setPage} onSize={list.setSize} />}>
        {page.length === 0 ? (
          <ListEmpty filtered={filtered} noun="past updates" onClear={() => list.clear(["puproject", "puweek"])} hint={filtered ? undefined : "Each update you confirm appears here."} />
        ) : (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Week</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Project</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Line for the Head</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Sent</th>
              </tr>
            </thead>
            <tbody>
              {page.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-[var(--qink)]">Week {r.isoWeek.split("-W")[1]}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/projects/${r.projectId}?tab=This%20week`} className={`rounded-sm font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                      {r.projectName}
                    </Link>
                    <span className="block text-[12px] text-[var(--ink3)]">{r.projectCode}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <HealthPill value={r.rag} />
                  </td>
                  <td className="max-w-[440px] px-3 py-2.5 text-[var(--ink2)]">
                    <span className="line-clamp-2">{r.narrative ?? <span className="text-[var(--ink3)]">No line</span>}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-[var(--ink3)]">{r.sentAt ? formatDayMonth(r.sentAt, timeZone) : "Not sent"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </section>
  );
}

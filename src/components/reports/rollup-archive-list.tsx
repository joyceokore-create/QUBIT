"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FilterChips, FilterSelect, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { formatDayMonth } from "@/lib/dates";
import { matchesSearch, paginate } from "@/lib/list-state";
import { COMPACT, FOCUS, THEAD } from "@/lib/surface";

/**
 * UX12 (L1–L3, D13) — the Head's Past roll-ups on the shared list kit: search, a Status filter,
 * always-visible pagination (default 5, remembered), URL state. Row links come from the server
 * (`href`) because a server component can't hand a function to a client one.
 */
export interface ArchiveListRow {
  isoWeek: string;
  status: "Draft" | "Approved";
  narrative: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  projects: number;
  href: string;
}

const STATUS_WORD: Record<ArchiveListRow["status"], { label: string; tok: string }> = {
  Approved: { label: "Approved", tok: "--ok-ink" },
  Draft: { label: "Draft", tok: "--warn-ink" },
};

export function RollupArchiveList({ rows, isHead, timeZone }: { rows: ArchiveListRow[]; isHead: boolean; timeZone: string }) {
  // "ra-*" keys so they never clash with /reports' own ?week / ?as / ?tab.
  const list = useListUrl("rollups", 5);
  const status = list.get("rastatus");
  const q = list.q;
  const filtered = useMemo(
    () => rows.filter((r) => (!status || r.status === status) && matchesSearch(q, r.isoWeek, r.narrative, r.approvedByName)),
    [rows, status, q],
  );
  const { rows: page, info } = paginate(filtered, list.page, list.size);
  const active = status ? [{ key: "rastatus", label: `Status: ${status}` }] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={q} onChange={(v) => list.set({ q: v })} placeholder="Search weeks or summaries" label="Search past roll-ups" />
          <FilterSelect
            label="Status"
            allLabel="All statuses"
            value={status}
            options={[
              { value: "Approved", label: "Approved" },
              { value: "Draft", label: "Draft" },
            ]}
            onChange={(v) => list.set({ rastatus: v })}
          />
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear(["rastatus"])} />
        </ListToolbar>
      </div>
      <TableCard footer={<TableFooter info={info} noun="roll-ups" onPage={list.setPage} onSize={list.setSize} />}>
        {page.length === 0 ? (
          <ListEmpty
            filtered={!!status || !!q}
            noun="roll-ups"
            onClear={() => list.clear(["rastatus"])}
            hint={isHead ? "Approve this week's roll-up on This week and it appears here." : "Approved roll-ups appear here."}
          />
        ) : (
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Week</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Projects</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Head&apos;s summary</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Signed</th>
                <th scope="col" className="px-3 py-2.5"><span className="sr-only">Downloads</span></th>
              </tr>
            </thead>
            <tbody>
              {page.map((r) => (
                <tr key={r.isoWeek} className="border-b border-[var(--border)] last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link href={r.href} className={`rounded-sm font-semibold text-[var(--qink)] hover:underline ${FOCUS}`}>
                      Week {r.isoWeek.split("-W")[1]}
                    </Link>
                    <span className="block text-[12px] text-[var(--ink3)]">{r.isoWeek.split("-W")[0]}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[12.5px] font-semibold" style={{ color: `var(${STATUS_WORD[r.status].tok})` }}>
                      {STATUS_WORD[r.status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--ink2)]">{r.projects}</td>
                  <td className="max-w-[420px] px-3 py-2.5 text-[var(--ink2)]">
                    <span className="line-clamp-2">{r.narrative ?? <span className="text-[var(--ink3)]">No summary yet</span>}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-[var(--ink3)]">
                    {r.approvedByName ? `${r.approvedByName}${r.approvedAt ? ` · ${formatDayMonth(r.approvedAt, timeZone)}` : ""}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="flex gap-2">
                      <a href={`/api/reports/export?template=digest&week=${r.isoWeek}`} download className={COMPACT}>
                        PDF
                      </a>
                      <a href={`/api/rollup/export?week=${r.isoWeek}`} download className={COMPACT}>
                        CSV
                      </a>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}

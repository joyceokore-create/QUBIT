"use client";

import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import type { PageInfo } from "@/lib/list-state";
import { formatDayKey } from "@/lib/list-query";
import { FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

// UX5 (L1–L5): the server pages, searches and filters the audit log (see page.tsx); this
// component renders the toolbar, the current page and the always-visible footer, with every
// bit of view state in the URL.

interface Row {
  id: string;
  /** Pre-formatted in the tenant's time zone on the server. */
  when: string;
  createdAt: string;
  actor: string;
  action: string;
  entity: string;
}

const FILTER_KEYS = ["action", "actor", "from", "to"] as const;
// Same 36px control as the shared toolbar's search and selects (list-toolbar.tsx).
const DATE_CONTROL = `h-[var(--control-h)] rounded-[var(--control-r)] border border-[var(--input)] bg-[var(--qcard)] px-2.5 text-[13px] text-[var(--qink)] ${FOCUS}`;

export function AuditClient({
  rows,
  info,
  actions,
  actors,
  range,
  anyEvents,
}: {
  rows: Row[];
  info: PageInfo;
  actions: string[];
  actors: { id: string; name: string }[];
  /** The validated from/to days ("YYYY-MM-DD", or "" when unset/invalid). */
  range: { from: string; to: string };
  anyEvents: boolean;
}) {
  const list = useListUrl("admin-audit", 10);
  const action = list.get("action");
  const actor = list.get("actor");

  const actorName = actors.find((a) => a.id === actor)?.name;
  const active: ActiveFilter[] = [
    ...(action && actions.includes(action) ? [{ key: "action", label: `Action: ${action}` }] : []),
    ...(actorName ? [{ key: "actor", label: `Who: ${actorName}` }] : []),
    ...(range.from ? [{ key: "from", label: `From: ${formatDayKey(range.from)}` }] : []),
    ...(range.to ? [{ key: "to", label: `To: ${formatDayKey(range.to)}` }] : []),
  ];
  const filtered = anyEvents && (active.length > 0 || !!list.q);

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search actions, entities or IDs" label="Search the audit log" />
          <FilterSelect label="Action" allLabel="All actions" value={action} options={actions.map((a) => ({ value: a, label: a }))} onChange={(v) => list.set({ action: v })} />
          <FilterSelect label="Who" allLabel="Everyone" value={actor} options={actors.map((a) => ({ value: a.id, label: a.name }))} onChange={(v) => list.set({ actor: v })} />
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink3)]">
            From
            <input
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => list.set({ from: e.target.value })}
              className={cn(DATE_CONTROL, range.from && "border-[color-mix(in_oklab,var(--brand)_45%,var(--input))]")}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink3)]">
            To
            <input
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => list.set({ to: e.target.value })}
              className={cn(DATE_CONTROL, range.to && "border-[color-mix(in_oklab,var(--brand)_45%,var(--input))]")}
            />
          </label>
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
      </div>

      <TableCard footer={<TableFooter info={info} noun="audit events" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty filtered={filtered} noun="audit events" onClear={() => list.clear([...FILTER_KEYS])} />
        ) : (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="w-[160px] px-4 py-2.5 font-semibold">When</th>
                <th scope="col" className="w-[200px] px-3 py-2.5 font-semibold">Who</th>
                <th scope="col" className="w-[220px] px-3 py-2.5 font-semibold">Action</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Entity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-[var(--ink3)]">
                    <time dateTime={r.createdAt}>{r.when}</time>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[var(--ink2)]">
                    <span className="block max-w-[200px] truncate">{r.actor}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-[5px] bg-[var(--surface-2)] px-2 py-[3px] font-mono text-[11px] font-semibold text-[var(--ink2)]">{r.action}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-[var(--ink3)]" title={r.entity}>
                    <span className="block max-w-[420px] truncate">{r.entity}</span>
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

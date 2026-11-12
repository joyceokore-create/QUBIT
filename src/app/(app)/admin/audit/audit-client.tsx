"use client";

import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import type { PageInfo } from "@/lib/list-state";
import { formatDayKey } from "@/lib/list-query";
import { AUDIT_PERIODS } from "@/lib/audit-view";
import { THEAD, TROW } from "@/lib/surface";

// UX5 (L1–L5) + UX fidelity Tier 2 (design: "Audit log"): the server pages, searches and
// filters (page.tsx); this renders the toolbar (search · Action · Who · period), the current
// page with When · Who · Action · Record · Before → After, and the always-visible footer.

interface Row {
  id: string;
  /** Pre-formatted in the tenant's time zone on the server. */
  when: string;
  createdAt: string;
  actor: string;
  action: string;
  record: string;
  /** Allow-listed fields only (lib/audit-view). */
  change: string;
}

const FILTER_KEYS = ["action", "actor", "period", "from", "to"] as const;

export function AuditClient({
  rows,
  info,
  actionOptions,
  actors,
  period,
  range,
  anyEvents,
}: {
  rows: Row[];
  info: PageInfo;
  actionOptions: { value: string; label: string }[];
  actors: { id: string; name: string }[];
  /** The validated period preset ("7d"/"30d"/"90d", or ""). */
  period: string;
  /** Free from/to days ("YYYY-MM-DD", or "") — from an older link; shown as a filter chip. */
  range: { from: string; to: string };
  anyEvents: boolean;
}) {
  const list = useListUrl("admin-audit", 10);
  const action = list.get("action");
  const actor = list.get("actor");

  const active: ActiveFilter[] = [
    ...(action && actionOptions.some((o) => o.value === action) ? [{ key: "action", label: "Action" }] : []),
    ...(actor && actors.some((a) => a.id === actor) ? [{ key: "actor", label: "Who" }] : []),
    ...(period ? [{ key: "period", label: "Period" }] : []),
    ...(range.from ? [{ key: "from", label: `From: ${formatDayKey(range.from)}` }] : []),
    ...(range.to ? [{ key: "to", label: `To: ${formatDayKey(range.to)}` }] : []),
  ];
  const filtered = anyEvents && (active.length > 0 || !!list.q);

  return (
    <>
      <ListToolbar label="Search and filter the audit log">
        <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search by user or record" label="Search the audit log" />
        <FilterSelect label="Action" allLabel="All actions" value={action} options={actionOptions} onChange={(v) => list.set({ action: v })} />
        <FilterSelect label="Who" allLabel="Everyone" value={actor} options={actors.map((a) => ({ value: a.id, label: a.name }))} onChange={(v) => list.set({ actor: v })} />
        <FilterSelect label="Period" allLabel="Any time" value={period} options={AUDIT_PERIODS.map((p) => ({ value: p.value, label: p.label }))} onChange={(v) => list.set({ period: v, from: null, to: null })} />
        <FilterChips filters={active} onClearAll={() => list.clear([...FILTER_KEYS])} />
      </ListToolbar>

      <TableCard footer={<TableFooter info={info} noun="audit events" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty filtered={filtered} noun="audit events" onClear={() => list.clear([...FILTER_KEYS])} />
        ) : (
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-[12.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col" className="w-[150px]">When</th>
                <th scope="col" className="w-[170px]">Who</th>
                <th scope="col" className="w-[190px]">Action</th>
                <th scope="col">Record</th>
                <th scope="col">Before → After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={TROW}>
                  <td className="whitespace-nowrap tabular-nums text-[var(--ds-ink3)]">
                    <time dateTime={r.createdAt}>{r.when}</time>
                  </td>
                  <td className="text-[var(--ds-ink2)]">
                    <span className="block max-w-[170px] truncate">{r.actor}</span>
                  </td>
                  <td className="text-[var(--ds-ink2)]">{r.action}</td>
                  <td>
                    <b className="block max-w-[260px] truncate font-semibold text-[var(--ds-ink)]">{r.record}</b>
                  </td>
                  <td className="text-[var(--ds-ink2)]">
                    <span className="block max-w-[360px] truncate" title={r.change}>
                      {r.change || "—"}
                    </span>
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

"use client";

import { useState } from "react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import type { PageInfo } from "@/lib/list-state";
import { FOCUS } from "@/lib/surface";

// UX5 (L1–L5): the server pages, searches and filters (see page.tsx); this component only
// renders the toolbar, the current page and the always-visible footer, all state in the URL.

type Status = "NEW" | "REVIEWED" | "DISMISSED";

interface Row {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  status: Status;
  /** Pre-formatted in the tenant's time zone on the server. */
  when: string;
  createdAt: string;
}

const STATUS_LABEL: Record<Status, string> = { NEW: "New", REVIEWED: "Reviewed", DISMISSED: "Dismissed" };
const STATUS_STYLE: Record<Status, string> = {
  NEW: "bg-[var(--okbg)] text-[var(--ok)]",
  REVIEWED: "bg-[var(--wash2)] text-[var(--ink3)]",
  DISMISSED: "bg-[var(--wash2)] text-[var(--ink4)]",
};
const FILTER_KEYS = ["status"] as const;
const ACTION_BTN = `rounded-[6px] border border-[var(--hair)] px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-40 ${FOCUS}`;

export function AccessRequestsClient({ rows, info, anyRequests }: { rows: Row[]; info: PageInfo; anyRequests: boolean }) {
  const list = useListUrl("admin-access-requests", 5);
  const status = list.get("status") as Status | "";
  const { error, mutate } = useAdminMutation();
  // Which ROW is in flight — the hook's `busy` is a single boolean, and this table
  // disables per row. The hook surfaces the server's message when a review fails.
  const [busy, setBusy] = useState<string | null>(null);

  async function review(id: string, next: "REVIEWED" | "DISMISSED") {
    setBusy(id);
    try {
      await mutate(`/api/admin/access-requests/${id}`, "PATCH", { status: next }, { fallback: "Could not update the request." });
    } finally {
      setBusy(null);
    }
  }

  const active: ActiveFilter[] = status && STATUS_LABEL[status] ? [{ key: "status", label: `Status: ${STATUS_LABEL[status]}` }] : [];
  // L5: "No access requests match these filters" only when filters hide real rows; with none
  // at all it reads "No access requests yet".
  const filtered = anyRequests && (active.length > 0 || !!list.q);

  return (
    <>
      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search names, emails or companies" label="Search access requests" className="sm:w-[320px]" />
          <FilterSelect
            label="Status"
            allLabel="All statuses"
            value={status}
            options={(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            onChange={(v) => list.set({ status: v })}
          />
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-status-red">
          {error}
        </p>
      )}

      <TableCard footer={<TableFooter info={info} noun="access requests" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty
            filtered={filtered}
            noun="access requests"
            onClear={() => list.clear([...FILTER_KEYS])}
            hint={filtered ? undefined : "Requests sent from the sign-in page's “Request access” form appear here."}
          />
        ) : (
          <table className="relative w-full min-w-[760px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="w-[150px] px-4 py-2.5 font-semibold">Received</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Requester</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Company</th>
                <th scope="col" className="w-[110px] px-3 py-2.5 font-semibold">Status</th>
                <th scope="col" className="w-[170px] px-3 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-[12px] tabular-nums text-[var(--ink3)]">
                    <time dateTime={r.createdAt}>{r.when}</time>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[340px] truncate font-semibold text-[var(--qink)]">
                      {r.fullName}
                      {r.jobTitle ? <span className="font-normal text-[var(--ink3)]"> · {r.jobTitle}</span> : null}
                    </span>
                    <span className="block max-w-[340px] truncate text-[12px] text-[var(--ink3)]">{r.email}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink2)]">
                    <span className="block max-w-[240px] truncate">{r.company}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-[5px] px-2 py-[3px] text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={busy === r.id || r.status === "REVIEWED"}
                        onClick={() => review(r.id, "REVIEWED")}
                        className={`${ACTION_BTN} text-[var(--ink2)] hover:border-[var(--brand)]`}
                      >
                        Reviewed
                      </button>
                      <button
                        type="button"
                        disabled={busy === r.id || r.status === "DISMISSED"}
                        onClick={() => review(r.id, "DISMISSED")}
                        className={`${ACTION_BTN} text-[var(--ink3)] hover:border-[var(--bad)]`}
                      >
                        Dismiss
                      </button>
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

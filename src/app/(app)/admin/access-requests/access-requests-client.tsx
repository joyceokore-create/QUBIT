"use client";

import { useMemo, useState } from "react";
import { AccessRequestDrawer } from "@/components/admin-home/admin-home";
import { PageHeader } from "@/components/list/page-header";
import { FilterSelect, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { Chip } from "@/components/ui/status-pill";
import { TabStrip } from "@/components/ui/tab-strip";
import { AR_TAB_LABEL, AR_TAB_STATUS, AR_TABS, agoLabel, daysOld, requestChip, type AdminHomeData, type AdminRequestRow, type ArStatus, type ArTab } from "@/lib/admin-home";
import { formatDate } from "@/lib/dates";
import { REQUESTABLE_ROLES, requestedRoleLabel } from "@/lib/access-request-schema";
import type { PageInfo } from "@/lib/list-state";
import { COMPACT, THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

// UX5 (L1–L5) + UX fidelity F1. The server pages and searches (page.tsx); this renders the
// header, status tabs, toolbar, the table with its pager, and the shared review drawer.
// Filters: Requested Role (from the public form, D-F3). The design's "Department" filter isn't
// offered: department is chosen by the admin at grant time and isn't stored on the request.

const EMPTY_HINT: Record<ArTab, string> = {
  waiting: "Requests from the sign-in page's “Request access” form appear here, oldest first.",
  reviewed: "Requests you approve appear here, most recent first.",
  dismissed: "Requests you decline appear here, most recent first.",
};

export function AccessRequestsClient({
  tab,
  counts,
  rows,
  info,
  timeZone,
  nowIso,
  grant,
}: {
  tab: ArTab;
  counts: Record<ArStatus, number>;
  rows: AdminRequestRow[];
  info: PageInfo;
  timeZone: string;
  nowIso: string;
  grant: AdminHomeData["grant"];
}) {
  const list = useListUrl("admin-access-requests", 5);
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [open, setOpen] = useState<AdminRequestRow | null>(null);
  const role = list.get("role");
  const filtered = !!list.q || !!role;

  return (
    <>
      <PageHeader title="Access Requests" description="People asking to join QUBIT." />
      <TabStrip
        label="Access request views"
        active={tab}
        tabs={AR_TABS.map((t) => ({ key: t, label: AR_TAB_LABEL[t], count: counts[AR_TAB_STATUS[t]], href: t === "waiting" ? "/admin/access-requests" : `/admin/access-requests?tab=${t}` }))}
      />
      <ListToolbar label="Search access requests">
        <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search by name, email or company" label="Search access requests" />
        <FilterSelect label="Requested Role" allLabel="All roles" value={role} options={REQUESTABLE_ROLES.map((r) => ({ value: r.key, label: r.label }))} onChange={(v) => list.set({ role: v })} />
      </ListToolbar>
      <TableCard footer={<TableFooter info={info} noun="access requests" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty filtered={filtered} noun="access requests" onClear={() => list.set({ q: "", role: null })} hint={filtered ? undefined : EMPTY_HINT[tab]} />
        ) : (
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-[12.5px]">
            <caption className="sr-only">{AR_TAB_LABEL[tab]} access requests</caption>
            <thead className={THEAD}>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Requested Role</th>
                <th scope="col">Company</th>
                <th scope="col">Status</th>
                <th scope="col">{tab === "waiting" ? "Requested" : "Decided By"}</th>
                <th scope="col" className="w-[90px]">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = daysOld(r.createdAt, now, timeZone);
                const chip = requestChip(r.status, days, r.requestedRole);
                return (
                  <tr key={r.id} className={cn(TROW, "transition-colors hover:[&>td]:bg-[var(--ds-surface2)]")}>
                    <td className="max-w-[300px]">
                      <span className="block truncate font-semibold text-[var(--ds-ink)]">{r.fullName}</span>
                      <span className="block truncate text-[12px] text-[var(--ds-ink3)]">{r.email}</span>
                    </td>
                    <td className="whitespace-nowrap text-[var(--ds-ink2)]">{requestedRoleLabel(r.requestedRole) ?? <span className="text-[var(--ds-ink3)]">Not given</span>}</td>
                    <td className="max-w-[240px]">
                      <span className="block truncate text-[var(--ds-ink2)]">{r.company}</span>
                      {r.jobTitle && <span className="block truncate text-[12px] text-[var(--ds-ink3)]">{r.jobTitle}</span>}
                    </td>
                    <td>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </td>
                    <td className="whitespace-nowrap text-[var(--ds-ink3)]">
                      {tab === "waiting" ? (
                        <span title={`Requested ${formatDate(r.createdAt, timeZone)}`}>{agoLabel(days)}</span>
                      ) : (
                        <>
                          <span className="block text-[var(--ds-ink2)]">{r.reviewedBy ?? "—"}</span>
                          {r.reviewedAt && <span className="block text-[12px]">{formatDate(r.reviewedAt, timeZone)}</span>}
                        </>
                      )}
                    </td>
                    <td className="text-right">
                      <button type="button" onClick={() => setOpen(r)} className={COMPACT} aria-label={`${r.status === "NEW" ? "Review" : "View"} ${r.fullName}'s request`}>
                        {r.status === "NEW" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
      <AccessRequestDrawer request={open} grant={grant} tz={timeZone} now={now} onClose={() => setOpen(null)} />
    </>
  );
}

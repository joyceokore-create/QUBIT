"use client";

import { useMemo, useState } from "react";
import { AccessRequestDrawer } from "@/components/admin-home/admin-home";
import { PageHeader } from "@/components/list/page-header";
import { FilterSelect, ListToolbar, SearchField } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { ListRow } from "@/components/ui/panel";
import { Chip } from "@/components/ui/status-pill";
import { TabStrip } from "@/components/ui/tab-strip";
import { AR_TAB_LABEL, AR_TAB_STATUS, AR_TABS, agoLabel, daysOld, requestChip, type AdminHomeData, type AdminRequestRow, type ArStatus, type ArTab } from "@/lib/admin-home";
import { formatDate } from "@/lib/dates";
import { REQUESTABLE_ROLES, requestedRoleLabel } from "@/lib/access-request-schema";
import type { PageInfo } from "@/lib/list-state";
import { COMPACT } from "@/lib/surface";

// UX5 (L1–L5) + UX fidelity F1. The server pages and searches (page.tsx); this renders the
// header, status tabs, toolbar, the row list with its pager, and the shared review drawer.
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
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((r) => {
              const days = daysOld(r.createdAt, now, timeZone);
              const chip = requestChip(r.status, days, r.requestedRole);
              return (
                <ListRow
                  key={r.id}
                  title={r.fullName}
                  sub={[requestedRoleLabel(r.requestedRole) ? `Asks for ${requestedRoleLabel(r.requestedRole)}` : null, r.company, r.jobTitle].filter(Boolean).join(" · ")}
                  chip={<Chip tone={chip.tone}>{chip.label}</Chip>}
                  meta={<span title={`Requested ${formatDate(r.createdAt, timeZone)}`}>{agoLabel(days)}</span>}
                  action={
                    <button type="button" onClick={() => setOpen(r)} className={COMPACT}>
                      {r.status === "NEW" ? "Review" : "View"}
                    </button>
                  }
                />
              );
            })}
          </ul>
        )}
      </TableCard>
      <AccessRequestDrawer request={open} grant={grant} tz={timeZone} now={now} onClose={() => setOpen(null)} />
    </>
  );
}

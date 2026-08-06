"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { CARD_GLASS as CARD } from "@/lib/surface";

interface Row {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  status: "NEW" | "REVIEWED" | "DISMISSED";
  createdAt: string;
}

const ROW = "grid grid-cols-[120px_minmax(0,1.2fr)_minmax(0,1fr)_110px_150px] items-center gap-3.5 p-[10px_18px]";

const STATUS_STYLE: Record<Row["status"], string> = {
  NEW: "bg-[var(--okbg)] text-[var(--ok)]",
  REVIEWED: "bg-[var(--wash2)] text-[var(--ink3)]",
  DISMISSED: "bg-[var(--wash2)] text-[var(--ink4)]",
};

export function AccessRequestsClient({ rows }: { rows: Row[] }) {
  const { error, mutate } = useAdminMutation();
  // Which ROW is in flight — the hook's `busy` is a single boolean, and this table
  // disables per row. Previously the response was ignored entirely, so a failed review
  // looked identical to a successful one; the hook surfaces the server's message now.
  const [busy, setBusy] = useState<string | null>(null);

  async function review(id: string, status: "REVIEWED" | "DISMISSED") {
    setBusy(id);
    try {
      await mutate(`/api/admin/access-requests/${id}`, "PATCH", { status }, {
        fallback: "Could not update the request.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-status-red">
          {error}
        </p>
      )}
      <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${ROW} border-b border-[var(--hair)] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
            <span>When</span><span>Requester</span><span>Company</span><span>Status</span><span>Actions</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className={`${ROW} border-b border-[var(--hair2)] last:border-0 hover:bg-[var(--wash)]`}>
              <span className="font-mono rv:font-data text-[10px] rv:text-data-sm text-[var(--ink4)]">{format(new Date(r.createdAt), "MMM d HH:mm")}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] rv:text-body-sm font-medium text-[var(--ink2)]">{r.fullName}{r.jobTitle ? ` · ${r.jobTitle}` : ""}</span>
                <span className="block truncate text-[11px] rv:text-body-xs text-[var(--ink4)]">{r.email}</span>
              </span>
              <span className="truncate text-[12px] rv:text-body-sm text-[var(--ink3)]">{r.company}</span>
              <span className={`justify-self-start rounded-[5px] px-2 py-[3px] text-[10px] font-semibold ${STATUS_STYLE[r.status]}`}>{r.status.toLowerCase()}</span>
              <span className="flex gap-1.5">
                <button type="button" disabled={busy === r.id || r.status === "REVIEWED"} onClick={() => review(r.id, "REVIEWED")}
                  className="rounded-[6px] border border-[var(--hair)] px-2 py-1 text-[11px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--brand)] disabled:opacity-40">
                  Reviewed
                </button>
                <button type="button" disabled={busy === r.id || r.status === "DISMISSED"} onClick={() => review(r.id, "DISMISSED")}
                  className="rounded-[6px] border border-[var(--hair)] px-2 py-1 text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:border-[var(--bad)] disabled:opacity-40">
                  Dismiss
                </button>
              </span>
            </div>
          ))}
          {rows.length === 0 && <div className="p-8 text-center text-[12px] rv:text-body-sm text-[var(--ink5)]">No access requests yet.</div>}
        </div>
      </div>
    </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

interface Row {
  id: string;
  fullName: string;
  email: string;
  company: string;
  jobTitle: string | null;
  status: "NEW" | "REVIEWED" | "DISMISSED";
  createdAt: string;
}

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";
const ROW = "grid grid-cols-[120px_minmax(0,1.2fr)_minmax(0,1fr)_110px_150px] items-center gap-3.5 p-[10px_18px]";

const STATUS_STYLE: Record<Row["status"], string> = {
  NEW: "bg-[var(--okbg)] text-[var(--ok)]",
  REVIEWED: "bg-[var(--wash2)] text-[var(--ink3)]",
  DISMISSED: "bg-[var(--wash2)] text-[var(--ink4)]",
};

export function AccessRequestsClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function review(id: string, status: "REVIEWED" | "DISMISSED") {
    setBusy(id);
    try {
      await fetch(`/api/admin/access-requests/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${ROW} border-b border-[var(--hair)] font-mono text-[9px] font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}>
            <span>When</span><span>Requester</span><span>Company</span><span>Status</span><span>Actions</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className={`${ROW} border-b border-[var(--hair2)] last:border-0 hover:bg-[var(--wash)]`}>
              <span className="font-mono text-[10px] text-[var(--ink4)]">{format(new Date(r.createdAt), "MMM d HH:mm")}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-[var(--ink2)]">{r.fullName}{r.jobTitle ? ` · ${r.jobTitle}` : ""}</span>
                <span className="block truncate text-[11px] text-[var(--ink4)]">{r.email}</span>
              </span>
              <span className="truncate text-[12px] text-[var(--ink3)]">{r.company}</span>
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
          {rows.length === 0 && <div className="p-8 text-center text-[12px] text-[var(--ink5)]">No access requests yet.</div>}
        </div>
      </div>
    </div>
  );
}

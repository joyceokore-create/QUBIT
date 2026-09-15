"use client";

import { useState } from "react";

// The PM work queue (reference design): filterable merged action list. Serializable items
// only — project-drawer opens bubble up to CockpitInteractive via [data-open] delegation.

export interface PmQueueItem {
  kind: "due" | "soon" | "flag" | "info";
  title: string;
  detail: string;
  when: string; // e.g. "Overdue" | "in 3d" | "Before report"
  action: string; // button label: Re-baseline | Open | Review RAG | Escalate | Update
  projectId: string;
  projectName: string;
}

const KIND_COLOR: Record<PmQueueItem["kind"], string> = {
  due: "var(--bad)",
  soon: "var(--warn)",
  flag: "var(--brand)",
  info: "var(--ink4)",
};
const KIND_LABEL: Record<string, string> = { all: "All", due: "Overdue", soon: "Due soon", flag: "RAG alerts", info: "Updates" };

export function PmWorkQueue({ items }: { items: PmQueueItem[] }) {
  const [filter, setFilter] = useState<string>("all");
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <section
      id="pm-queue"
      className="rounded-[16px] border border-[var(--cardbd)] p-[16px_18px]"
      style={{ background: "var(--cardbg)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[15px] font-semibold text-[var(--qink)]">Work Queue</h2>
          <span className="text-[12px] text-[var(--ink4)]">{items.length} items · merged across projects</span>
        </div>
        <select
          aria-label="Filter queue"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-[var(--hair)] bg-[var(--wash2)] px-2.5 py-1 text-[12.5px] text-[var(--qink)] outline-none"
        >
          {Object.entries(KIND_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      <div className="flex flex-col">
        {shown.length === 0 && <span className="text-[12px] text-[var(--ink4)]">Nothing here — nice.</span>}
        {shown.map((q, i) => (
          <div key={i} className="grid grid-cols-[12px_1fr_auto] items-start gap-3 border-t border-[var(--hair)] py-3 first:border-t-0 first:pt-0">
            <span className="mt-1 size-2.5 rounded-sm" style={{ background: KIND_COLOR[q.kind] }} />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <button data-open={q.projectId} className="rounded bg-[var(--wash2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink2)]">{q.projectName}</button>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: q.kind === "due" ? "var(--badbg)" : "var(--wash2)", color: q.kind === "due" ? "var(--bad)" : "var(--ink3)" }}>{q.when}</span>
              </div>
              <b className="block font-semibold leading-snug text-[var(--qink)]">{q.title}</b>
              <span className="text-[13px] text-[var(--ink3)]">{q.detail}</span>
            </div>
            <button
              data-open={q.projectId}
              className="self-center whitespace-nowrap rounded-md border border-[var(--hair)] px-2.5 py-1 text-[12px] font-semibold text-[var(--brand)] hover:bg-[var(--brand-light)]"
            >
              {q.action}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

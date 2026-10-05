"use client";

import { useEffect, useState } from "react";
import { CARD_GLASS as CARD, RAG_TOKEN } from "@/lib/surface";

// Past weeks' confirmed check-ins for one project — the trail the current week sits on
// top of. Read-only; the live week is authored in the check-in card above it.

interface PastReport {
  id: string;
  isoWeek: string;
  rag: "Green" | "Amber" | "Red";
  narrative: string | null;
  submittedToHeadAt: string | null;
}

export function ReportHistory({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<PastReport[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/checkin/history`)
      .then((r) => r.json())
      .then((d) => alive && setHistory(d?.data ?? []))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [projectId]);

  return (
    <section className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }} aria-labelledby="report-history">
      <h2 id="report-history" className="mb-2 text-[13px] font-semibold text-foreground">Previous weeks</h2>
      {history === null ? (
        <p className="text-xs text-[var(--ink4)]">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-[var(--ink3)]">No confirmed check-ins yet — this week&apos;s will be the first.</p>
      ) : (
        <ol className="flex flex-col">
          {history.map((r) => (
            <li key={r.id} className="flex items-start gap-2.5 border-b border-[var(--hair2)] py-2 text-xs last:border-0">
              <span className="mt-1 size-2 flex-none rounded-full" style={{ background: `var(${RAG_TOKEN[r.rag]})` }} role="img" aria-label={`Status ${r.rag}`} />
              <span className="w-[64px] flex-none font-mono text-[10px] tabular-nums text-[var(--ink3)]">{r.isoWeek.replace("-W", " W")}</span>
              <span className="min-w-0 flex-1 text-[var(--ink2)]">{r.narrative ?? "—"}</span>
              {r.submittedToHeadAt && (
                <span className="flex-none rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
                  sent to Head
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { isoWeekId } from "@/lib/iso-week";
import { CARD_GLASS as CARD, CARD_BG, FOCUS, RAG_TOKEN, ragFill } from "@/lib/surface";

// Past weeks' confirmed status updates for one project — the trail the current week sits
// on top of. Milestone A: an eight-week RAG strip you can read in a glance, then the last
// three lines with "All weeks" for the rest. Read-only; the live week is authored above.

interface PastReport {
  id: string;
  isoWeek: string;
  rag: "Green" | "Amber" | "Red";
  narrative: string | null;
  submittedToHeadAt: string | null;
}

const STRIP_WEEKS = 8;
const SHOWN = 3;

export function ReportHistory({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<PastReport[] | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  // The eight ISO weeks BEFORE the current one (the current week is the card above),
  // oldest → newest; a week with no confirmed row is a hollow square.
  const strip = useMemo(() => {
    if (history === null) return [];
    const byWeek = new Map(history.map((r) => [r.isoWeek, r]));
    const now = Date.now();
    return Array.from({ length: STRIP_WEEKS }, (_, i) => {
      const k = STRIP_WEEKS - i;
      const isoWeek = isoWeekId(new Date(now - k * 7 * 86_400_000));
      return { isoWeek, rag: byWeek.get(isoWeek)?.rag ?? null };
    });
  }, [history]);

  const rows = history ? (expanded ? history : history.slice(0, SHOWN)) : [];

  return (
    <section className={`${CARD} flex flex-col gap-3 p-4`} style={CARD_BG} aria-labelledby="report-history">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="report-history" className="text-[13px] font-semibold text-foreground">
          Previous weeks
        </h2>
        {history !== null && (
          <ol className="flex items-center gap-[3px]" aria-label="Last eight weeks">
            {strip.map((w) => {
              const n = w.isoWeek.split("-W")[1];
              return (
                <li
                  key={w.isoWeek}
                  className="size-[18px] rounded-[4px]"
                  style={w.rag ? ragFill(w.rag) : { border: "1px solid var(--input)", background: "transparent" }}
                  title={w.rag ? `W${n} ${w.rag}` : `W${n} · no check-in`}
                  aria-label={w.rag ? `Week ${n}: ${w.rag}` : `Week ${n}: no check-in`}
                />
              );
            })}
          </ol>
        )}
        {history && history.length > SHOWN && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className={`ml-auto rounded-[4px] text-[12px] font-semibold text-[var(--ink3)] transition-colors hover:text-brand ${FOCUS}`}
          >
            {expanded ? "Show fewer" : "All weeks"}
          </button>
        )}
      </div>
      {history === null ? (
        <p className="text-xs text-[var(--ink4)]">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-[var(--ink3)]">No confirmed status updates yet — this week&apos;s will be the first.</p>
      ) : (
        <ol className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline gap-2.5 border-t border-[var(--hair2)] py-2 text-xs">
              <span className="w-[36px] flex-none font-mono text-[10.5px] font-semibold tabular-nums text-[var(--ink4)]">W{r.isoWeek.split("-W")[1]}</span>
              <span className="size-2 flex-none translate-y-[-1px] rounded-full" style={{ background: `var(${RAG_TOKEN[r.rag]})` }} role="img" aria-label={`Status ${r.rag}`} />
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

"use client";

import { useEffect, useState } from "react";
import { ragChipStyle } from "@/lib/surface";

// DM1.73 (docs/25 §3.1) — Overview must carry the "latest PM summary report": the most
// recent CONFIRMED check-in, read-only. Authoring stays in the Reports tab. The GET
// /api/projects/[id]/checkin route returns THIS week's view (draft when unconfirmed), so
// when the current week is still a draft we fall back to /checkin/history for the newest
// confirmed report — Overview never shows an unconfirmed draft as the project's word.

interface Latest {
  isoWeek: string;
  rag: string;
  narrative: string | null;
  confirmedByName: string | null;
}

export function LatestCheckinCard({
  projectId,
  onOpenReports,
}: {
  projectId: string;
  /** Jumps to the workspace Reports tab (tab state lives in the workspace). */
  onOpenReports: () => void;
}) {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cur = await fetch(`/api/projects/${projectId}/checkin`).then((r) => r.json()).catch(() => null);
      if (cur?.data?.status === "Confirmed") {
        if (!cancelled) {
          setLatest({
            isoWeek: cur.data.isoWeek,
            rag: cur.data.effectiveRag,
            narrative: cur.data.narrative,
            confirmedByName: cur.data.confirmedByName ?? null,
          });
          setLoaded(true);
        }
        return;
      }
      const hist = await fetch(`/api/projects/${projectId}/checkin/history`).then((r) => r.json()).catch(() => null);
      const first = hist?.data?.[0];
      if (!cancelled) {
        if (first) setLatest({ isoWeek: first.isoWeek, rag: first.rag, narrative: first.narrative, confirmedByName: null });
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[12.5px] font-bold text-[var(--qink)]">Latest confirmed check-in</h3>
        {latest && (
          <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[1.2px] text-[var(--ink4)]">
            {latest.isoWeek.replace("-W", " W")}
          </span>
        )}
      </div>
      {!loaded ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : latest ? (
        <div className="flex flex-col gap-1.5">
          <span className="w-fit rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={ragChipStyle(latest.rag)}>
            {latest.rag.toUpperCase()}
          </span>
          <p className="text-[12.5px] leading-[1.5] text-[var(--ink2)]">{latest.narrative ?? "—"}</p>
          {latest.confirmedByName && (
            <p className="text-[10.5px] text-[var(--ink5)]">Confirmed by {latest.confirmedByName}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-3">
          No confirmed check-in yet —{" "}
          <button type="button" onClick={onOpenReports} className="font-semibold text-brand underline-offset-2 hover:underline">
            the weekly loop lives in Reports
          </button>
          .
        </p>
      )}
    </div>
  );
}

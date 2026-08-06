"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckInCard } from "@/components/workspace/checkin-card";
import { CARD, RAG_TOKEN as RAG_TOK } from "@/lib/surface";

/**
 * M-P3a (docs/25 §3.5, docs/34) — the workspace Reports tab, role-composed:
 *  - a MEMBER sees their weekly update for THIS project (auto-drafted facts, their
 *    notes, queries & concerns to the PM) and submits from here;
 *  - a PM sees the week's check-in (confirm → send to the Head) and the report history;
 *  - everyone else reads the history.
 * Authoring lives in the workspace (docs/25 §6) — /reports becomes the thin index.
 */

interface SectionJson {
  projectId: string;
  projectCode: string;
  projectName: string;
  lines: string[];
  note: string | null;
  query: string | null;
}
interface MineJson {
  status: "Draft" | "Submitted" | "Acknowledged";
  isoWeek: string;
  draft: { sections: SectionJson[] };
}
interface PastReport {
  id: string;
  isoWeek: string;
  rag: "Green" | "Amber" | "Red";
  narrative: string | null;
  submittedToHeadAt: string | null;
}

export function WorkspaceReports({
  projectId,
  isPmView,
}: {
  projectId: string;
  /** canGovern — decides which authoring surface renders. */
  isPmView: boolean;
}) {
  const [mine, setMine] = useState<MineJson | null>(null);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<PastReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mineRes, histRes] = await Promise.all([
      isPmView ? Promise.resolve(null) : fetch("/api/member-reports").then((r) => r.json()).catch(() => null),
      fetch(`/api/projects/${projectId}/checkin/history`).then((r) => r.json()).catch(() => null),
    ]);
    if (mineRes?.mine) {
      setMine(mineRes.mine);
      const section = (mineRes.mine.draft?.sections ?? []).find((s: SectionJson) => s.projectId === projectId);
      setNote(section?.note ?? "");
      setQuery(section?.query ?? "");
    }
    setHistory(histRes?.data ?? []);
  }, [projectId, isPmView]);
  useEffect(() => {
    void load();
  }, [load]);

  const section = mine?.draft?.sections?.find((s) => s.projectId === projectId) ?? null;
  const editable = mine?.status === "Draft";

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/member-reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: { [projectId]: note.trim() || null }, queries: { [projectId]: query.trim() || null } }),
    });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => null))?.error?.message ?? "Could not save.");
    else void load();
  }
  async function submit() {
    setBusy(true);
    setError(null);
    await save();
    const res = await fetch("/api/member-reports/submit", { method: "POST" });
    setBusy(false);
    if (!res.ok) setError((await res.json().catch(() => null))?.error?.message ?? "Could not submit.");
    else void load();
  }

  return (
    <div className="flex flex-col gap-3.5">
      {isPmView ? (
        <CheckInCard projectId={projectId} />
      ) : (
        <div className={`${CARD} flex flex-col gap-2.5 p-4`} style={{ background: "var(--cardbg)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-foreground">My weekly update — this project</span>
            {mine && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={
                  mine.status === "Draft"
                    ? { color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }
                    : { color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }
                }
              >
                {mine.status}
              </span>
            )}
          </div>
          {!section && (
            <p className="text-xs text-ink-3">
              This week&apos;s draft has no section for this project yet — it appears once board activity exists,
              or open your full update under Reports.
            </p>
          )}
          {section && (
            <>
              <ul className="flex flex-col gap-0.5 pl-4 text-xs text-ink-2">
                {section.lines.map((l, i) => (
                  <li key={i} className="list-disc">{l}</li>
                ))}
              </ul>
              <label className="text-[10px] font-bold tracking-[0.8px] text-ink-3 uppercase" htmlFor="wr-note">My notes</label>
              <textarea
                id="wr-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!editable}
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs"
              />
              <label className="text-[10px] font-bold tracking-[0.8px] text-ink-3 uppercase" htmlFor="wr-query">
                Queries &amp; concerns to the PM
              </label>
              <textarea
                id="wr-query"
                rows={2}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!editable}
                placeholder="e.g. Has the TZ launch date moved? It affects my test plan."
                className="w-full rounded-lg border border-input bg-background p-2.5 text-xs"
              />
              {error && <p className="text-[11px] text-status-red">{error}</p>}
              {editable && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void save()} disabled={busy} className="rounded-[8px] border border-[var(--w10)] px-3 py-1.5 text-[11.5px] font-semibold text-ink-2">
                    Save draft
                  </button>
                  <button type="button" onClick={() => void submit()} disabled={busy} className="rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)]">
                    Submit weekly update →
                  </button>
                  <span className="text-[10px] text-ink-3">submits your whole week (all projects) to their PMs</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
        <div className="mb-2 text-[13px] font-semibold text-foreground">Report history</div>
        {history.length === 0 && <p className="text-xs text-ink-3">No confirmed reports yet.</p>}
        <div className="flex flex-col">
          {history.map((r) => (
            <div key={r.id} className="flex items-start gap-2.5 border-b border-[var(--w06)] py-2 text-xs last:border-0">
              <span className="mt-1 size-2 flex-none rounded-full" style={{ background: `var(${RAG_TOK[r.rag]})` }} />
              <span className="w-[64px] flex-none font-mono text-[10px] text-ink-3">{r.isoWeek.replace("-W", " W")}</span>
              <span className="min-w-0 flex-1 text-ink-2">{r.narrative ?? "—"}</span>
              {r.submittedToHeadAt && (
                <span className="flex-none rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
                  sent to Head
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

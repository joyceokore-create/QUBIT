"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import type { MemberReportSection } from "@/server/member-reports";
import { CARD } from "@/lib/surface";

// The lead's side of the member report loop (docs/18 §5.1.3/4): reports submitted by
// members of the projects I lead, each showing ONLY my project's section. Acknowledging
// is per project — a PM of A never signs off B — and rolls into my check-in draft.

interface TeamRow {
  id: string;
  userId: string;
  userName: string;
  isoWeek: string;
  status: string;
  submittedAt: string | null;
  narrative: string | null;
  sections: MemberReportSection[];
  pendingProjectIds: string[];
}

export function TeamReports() {
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/member-reports");
    if (!res.ok) return;
    const json = (await res.json()) as { team: TeamRow[] };
    setRows(json.team);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!rows) {
    return (
      <div className={`${CARD} flex items-center gap-2 p-4 text-[12px] text-[var(--ink5)]`} style={{ background: "var(--cardbg)" }}>
        <Loader2 className="size-3.5 animate-spin" /> Loading team reports…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={`${CARD} p-4 text-[12px] text-[var(--ink5)]`} style={{ background: "var(--cardbg)" }}>
        No member reports submitted to you this week.
      </div>
    );
  }

  const acknowledge = async (reportId: string, projectId: string) => {
    setBusy(`${reportId}:${projectId}`);
    setError(null);
    const res = await fetch(`/api/member-reports/${reportId}/acknowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not acknowledge.");
    } else {
      await load();
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}
      {rows.map((row) => (
        <div key={row.id} className={CARD} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{row.userName}</span>
            <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">{row.isoWeek}</span>
            {row.submittedAt && (
              <span className="font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink5)]">
                sent {new Date(row.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
          {row.narrative && (
            <p className="border-b border-[var(--hair2)] p-[10px_16px] text-[12.5px] italic leading-relaxed text-[var(--ink2)]">
              “{row.narrative}”
            </p>
          )}
          {row.sections.map((s) => {
            const pending = row.pendingProjectIds.includes(s.projectId);
            return (
              <div key={s.projectId} className="border-b border-[var(--hair2)] p-[10px_16px] last:border-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-[1.2px] text-[var(--qink)]">
                    {s.projectName}
                  </span>
                  {pending ? (
                    <button
                      type="button"
                      onClick={() => void acknowledge(row.id, s.projectId)}
                      disabled={busy !== null}
                      className="ml-auto flex items-center gap-1.5 rounded-[7px] border border-[var(--w07)] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.6px] text-[var(--qink)] hover:bg-[var(--wash)] disabled:opacity-60"
                    >
                      {busy === `${row.id}:${s.projectId}` ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
                      Acknowledge
                    </button>
                  ) : (
                    <span className="ml-auto flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[.8px] text-[var(--ok)]">
                      <CheckCheck className="size-3" /> acknowledged
                    </span>
                  )}
                </div>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {s.lines.map((line, i) => (
                    <li key={i} className="text-[12px] text-[var(--ink2)]">
                      {line}
                    </li>
                  ))}
                </ul>
                {s.note && <p className="mt-1 text-[11.5px] italic text-[var(--ink3)]">“{s.note}”</p>}
                {/* M-P3a (docs/25 §5.1) — the member's question travels WITH the report. */}
                {s.query && (
                  <p className="mt-1.5 rounded-[8px] px-2.5 py-1.5 text-[11.5px]" style={{ color: "var(--qinfo)", background: "color-mix(in oklab, var(--qinfo) 10%, transparent)" }}>
                    <span className="font-bold">Query for you:</span> {s.query}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

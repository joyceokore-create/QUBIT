"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, ArrowRight, ShieldAlert, PenLine } from "lucide-react";
import { CARD_GLASS as CARD, RAG_TOKEN } from "@/lib/surface";

// "My week" queue (docs/38) — confirm every project's weekly check-in from one place.
// The draft is pre-composed; the PM adjusts the one line, sets RAG if they disagree,
// and confirms. Confirming IS the status update. Sending forwards it to the Head.
// Rows are grouped by the same three states the cockpit meter above is drawn from, so
// the page reads as one picture: the meter says how far the week has got, the queue
// says which projects are where.

interface Row {
  projectId: string;
  code: string;
  name: string;
  portfolioName: string;
  status: "Draft" | "Confirmed";
  computedRag: string;
  effectiveRag: string;
  narrative: string | null;
  draftLines: string[];
  confirmed: boolean;
  sentToHead: boolean;
  canConfirm: boolean;
}

type Stage = "pending" | "confirmed" | "reported";
const SECTIONS: { key: Stage; label: string; tok: string; hollow?: boolean }[] = [
  { key: "pending", label: "To report", tok: "--ink4", hollow: true },
  { key: "confirmed", label: "Confirmed, not sent", tok: "--qinfo" },
  { key: "reported", label: "Reported", tok: "--ok" },
];

const RAGS = ["Green", "Amber", "Red"] as const;

/** One focus treatment for every control on the queue — brand ring, offset off the card. */
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cardbg)]";
const PRIMARY = `flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const QUIET = `flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand ${FOCUS}`;

function stageOf(r: Row): Stage {
  if (r.confirmed && r.sentToHead) return "reported";
  if (r.confirmed) return "confirmed";
  return "pending";
}

function RagDot({ rag }: { rag: string }) {
  const tok = RAG_TOKEN[rag] ?? "--ink4";
  return <span className="size-2.5 flex-none rounded-full" style={{ background: `var(${tok})` }} role="img" aria-label={`Status ${rag}`} />;
}

function RowCard({ row: r, onChange: update }: { row: Row; onChange: (r: Row) => void }) {
  // Row truth lives in the queue (so a confirmed row re-sorts into its new section);
  // this component only owns the in-flight edit.
  // Prefill the narrative with the strongest draft line so confirming is one click.
  const [narrative, setNarrative] = useState(r.narrative ?? r.draftLines[0] ?? "");
  const [override, setOverride] = useState<string>("Computed");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim(), ...(override !== "Computed" ? { ragOverride: override, overrideReason: "Set from My week" } : {}) }),
    });
    setBusy(false);
    if (res.ok) {
      const d = await res.json();
      update({ ...r, confirmed: true, status: "Confirmed", narrative: d.data?.narrative ?? narrative, effectiveRag: d.data?.effectiveRag ?? r.effectiveRag });
      setEditing(false);
    } else {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not confirm — try again.");
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin/submit`, { method: "POST" });
    setBusy(false);
    if (res.ok) update({ ...r, sentToHead: true });
    else setError((await res.json().catch(() => null))?.error?.message ?? "Could not send — try again.");
  };

  const stage = stageOf(r);
  const inputId = `mw-line-${r.projectId}`;

  return (
    <li className="flex flex-col gap-2.5 border-b border-[var(--hair2)] p-[14px_16px] last:border-0 transition-colors hover:bg-[var(--wash)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <RagDot rag={r.effectiveRag} />
        <Link href={`/projects/${r.projectId}?tab=This%20week`} className={`min-w-0 flex-1 truncate rounded-[4px] text-[13.5px] font-semibold text-[var(--qink)] transition-colors hover:text-brand ${FOCUS}`}>
          {r.name}
          <span className="ml-2 font-mono text-[10px] font-normal text-[var(--ink4)]">{r.code}</span>
        </Link>
        <span className="hidden text-[11px] text-[var(--ink4)] sm:block">{r.portfolioName}</span>
      </div>

      {/* The auto-draft, as evidence to confirm against; the confirmed line once it's set. */}
      {stage === "pending" && r.draftLines.length > 0 && !editing && (
        <ul className="flex flex-col gap-0.5 pl-[22px]">
          {r.draftLines.slice(0, 3).map((l, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-[1.5] text-[var(--ink3)]">
              <span className="mt-[7px] size-1 flex-none rounded-full bg-[var(--ink4)]" aria-hidden /> {l}
            </li>
          ))}
        </ul>
      )}
      {r.confirmed && r.narrative && <p className="pl-[22px] text-[12px] leading-[1.5] text-[var(--ink2)]">{r.narrative}</p>}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pl-[22px]">
        {!r.canConfirm ? (
          <span className="text-[11px] text-[var(--ink4)]">Read-only — you don&apos;t run this project.</span>
        ) : stage === "reported" ? (
          <Link href={`/projects/${r.projectId}?tab=This%20week`} className={QUIET}>
            View report <ArrowRight className="size-3" />
          </Link>
        ) : stage === "confirmed" ? (
          <button type="button" onClick={() => void send()} disabled={busy} className={PRIMARY}>
            {busy ? "Sending…" : "Send to the Head"} {!busy && <ArrowRight className="size-3.5" />}
          </button>
        ) : editing ? (
          <div className="flex w-full flex-col gap-2">
            <label htmlFor={inputId} className="sr-only">One line for leadership</label>
            <input
              id={inputId}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="One line — what should leadership take away this week?"
              autoFocus
              className={`h-9 w-full rounded-[8px] border border-[var(--hair)] bg-background px-2.5 text-xs text-foreground placeholder:text-[var(--ink4)] transition-colors focus:border-brand ${FOCUS}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Status">
                <span className="mr-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[.8px] text-[var(--ink4)]">RAG</span>
                {(["Computed", ...RAGS] as const).map((opt) => {
                  const active = override === opt;
                  const tok = opt === "Computed" ? "--ink4" : RAG_TOKEN[opt];
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setOverride(opt)}
                      className={`rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${FOCUS}`}
                      style={{ borderColor: active ? `var(${tok})` : "var(--hair)", color: active ? `var(${tok})` : "var(--ink4)", background: active ? `color-mix(in oklab, var(${tok}) 10%, transparent)` : "transparent" }}
                    >
                      {opt === "Computed" ? `Computed (${r.computedRag})` : opt}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => setEditing(false)} className={`${QUIET} ml-auto`}>
                Cancel
              </button>
              <button type="button" onClick={() => void confirm()} disabled={busy || !narrative.trim()} className={PRIMARY}>
                <CheckCheck className="size-3.5" /> {busy ? "Confirming…" : "Confirm check-in"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => void confirm()} disabled={busy || !narrative.trim()} className={PRIMARY}>
              <CheckCheck className="size-3.5" /> {busy ? "Confirming…" : "Confirm check-in"}
            </button>
            <button type="button" onClick={() => setEditing(true)} className={QUIET}>
              <PenLine className="size-3" /> Edit line or RAG
            </button>
          </>
        )}
        {error && (
          <span role="alert" className="flex items-center gap-1 text-[11px] text-[var(--bad)]">
            <ShieldAlert className="size-3" /> {error}
          </span>
        )}
      </div>
    </li>
  );
}

export function MyWeekQueue({ rows: initial, scope }: { rows: Row[]; scope: "owned" | "oversight" }) {
  // Rows re-sort into their new section as they're confirmed / sent, so the queue drains
  // top-down the way the meter above fills left-to-right.
  const [rows, setRows] = useState<Row[]>(initial);
  const replace = (next: Row) => setRows((prev) => prev.map((p) => (p.projectId === next.projectId ? next : p)));

  if (rows.length === 0) {
    return (
      <div className={`${CARD} p-8 text-center`} style={{ background: "var(--cardbg)" }}>
        <p className="text-[13px] font-semibold text-[var(--qink)]">No projects to report on.</p>
        <p className="mt-1 text-[12px] text-[var(--ink4)]">
          {scope === "owned" ? "You don't lead any active projects this week." : "There are no active projects in the estate this week."}
        </p>
      </div>
    );
  }

  const grouped = new Map<Stage, Row[]>(SECTIONS.map((s) => [s.key, []]));
  for (const r of rows) grouped.get(stageOf(r))!.push(r);

  return (
    <div className={`${CARD} overflow-hidden [animation:rise_.5s_cubic-bezier(.22,1,.36,1)_.06s_both]`} style={{ background: "var(--cardbg)" }}>
      {SECTIONS.map((s) => {
        const list = grouped.get(s.key)!;
        if (!list.length) return null;
        return (
          <section key={s.key} aria-labelledby={`mw-${s.key}`} className="border-b border-[var(--hair2)] last:border-0">
            <h2 id={`mw-${s.key}`} className="flex items-center gap-2 bg-[var(--wash)] p-[7px_16px]">
              <span
                className="size-2 rounded-full"
                style={s.hollow ? { border: `1px solid var(${s.tok})` } : { background: `var(${s.tok})` }}
                aria-hidden
              />
              <span className="font-mono text-[9.5px] font-bold uppercase tracking-[.9px]" style={{ color: `var(${s.tok})` }}>{s.label}</span>
              <span className="font-mono text-[9.5px] tabular-nums text-[var(--ink5)]">{list.length}</span>
            </h2>
            <ul>
              {list.map((r) => (
                <RowCard key={r.projectId} row={r} onChange={replace} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

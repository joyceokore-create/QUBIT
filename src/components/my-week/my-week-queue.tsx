"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, ArrowRight, ShieldAlert } from "lucide-react";
import { CARD_GLASS as CARD, RAG_TOKEN } from "@/lib/surface";

// "My week" queue (docs/38) — confirm every project's weekly report from one place.
// The draft is pre-composed; the PM adjusts the one line, sets RAG if they disagree,
// and confirms. Confirming IS the status update. Sending forwards it to the Head.

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

const RAGS = ["Green", "Amber", "Red"] as const;

function RagDot({ rag }: { rag: string }) {
  const tok = RAG_TOKEN[rag] ?? "--ink4";
  return <span className="size-2.5 flex-none rounded-full" style={{ background: `var(${tok})` }} aria-label={rag} />;
}

function RowCard({ row }: { row: Row }) {
  const [r, setR] = useState<Row>(row);
  // Prefill the narrative with the strongest draft line so confirming is one click.
  const [narrative, setNarrative] = useState(r.narrative ?? r.draftLines[0] ?? "");
  const [override, setOverride] = useState<string>("Computed");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
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
      setR((prev) => ({ ...prev, confirmed: true, status: "Confirmed", narrative: d.data?.narrative ?? narrative, effectiveRag: d.data?.effectiveRag ?? prev.effectiveRag }));
      setOpen(false);
    } else {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not confirm.");
    }
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${r.projectId}/checkin/submit`, { method: "POST" });
    setBusy(false);
    if (res.ok) setR((prev) => ({ ...prev, sentToHead: true }));
    else setError((await res.json().catch(() => null))?.error?.message ?? "Could not send.");
  };

  const done = r.confirmed && r.sentToHead;

  return (
    <div className="flex flex-col gap-2.5 border-b border-[var(--hair2)] p-[14px_16px] last:border-0 transition-colors hover:bg-[var(--wash)]">
      <div className="flex flex-wrap items-center gap-2.5">
        <RagDot rag={r.effectiveRag} />
        <Link href={`/projects/${r.projectId}`} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--qink)] transition-colors hover:text-brand">
          {r.name}
          <span className="ml-2 font-mono text-[10px] font-normal text-[var(--ink4)]">{r.code}</span>
        </Link>
        <span className="hidden text-[11px] text-[var(--ink4)] sm:block">{r.portfolioName}</span>
        {/* State chip */}
        {done ? (
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
            <CheckCheck className="size-3" /> Reported
          </span>
        ) : r.confirmed ? (
          <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 12%, transparent)" }}>
            Confirmed — not sent
          </span>
        ) : (
          <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ color: "var(--qinfo)", background: "color-mix(in oklab, var(--qinfo) 12%, transparent)" }}>
            Draft ready
          </span>
        )}
      </div>

      {/* Auto-draft evidence */}
      {!r.confirmed && r.draftLines.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-[22px]">
          {r.draftLines.slice(0, 3).map((l, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-[1.5] text-[var(--ink3)]">
              <span className="mt-[7px] size-1 flex-none rounded-full bg-[var(--ink4)]" /> {l}
            </li>
          ))}
        </ul>
      )}
      {r.confirmed && r.narrative && <p className="pl-[22px] text-[12px] leading-[1.5] text-[var(--ink2)]">{r.narrative}</p>}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pl-[22px]">
        {!r.canConfirm ? (
          <span className="text-[11px] text-[var(--ink4)]">Read-only — you don&apos;t run this project.</span>
        ) : done ? (
          <Link href={`/projects/${r.projectId}?tab=This%20week`} className="flex items-center gap-1 text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand">
            View report <ArrowRight className="size-3" />
          </Link>
        ) : r.confirmed ? (
          <button type="button" onClick={() => void send()} disabled={busy} className="rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] disabled:opacity-50">
            {busy ? "Sending…" : "Send to Head →"}
          </button>
        ) : open ? (
          <div className="flex w-full flex-col gap-2">
            <input
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="One line — what should leadership take away this week?"
              className="h-9 w-full rounded-[8px] border border-ink-4 bg-background px-2.5 text-xs text-foreground outline-none focus:border-brand"
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[.6px] text-[var(--ink4)]">RAG</span>
                {(["Computed", ...RAGS] as const).map((opt) => {
                  const active = override === opt;
                  const tok = opt === "Computed" ? "--ink4" : RAG_TOKEN[opt];
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setOverride(opt)}
                      className="rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
                      style={{ borderColor: active ? `var(${tok})` : "var(--hair)", color: active ? `var(${tok})` : "var(--ink4)", background: active ? `color-mix(in oklab, var(${tok}) 10%, transparent)` : "transparent" }}
                    >
                      {opt === "Computed" ? `Computed (${r.computedRag})` : opt}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => void confirm()} disabled={busy || !narrative.trim()} className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] disabled:opacity-50">
                <Check className="size-3.5" /> {busy ? "Confirming…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => void confirm()} disabled={busy || !narrative.trim()} className="flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] disabled:opacity-50">
              <Check className="size-3.5" /> {busy ? "Confirming…" : "Confirm as drafted"}
            </button>
            <button type="button" onClick={() => setOpen(true)} className="text-[11px] font-semibold text-[var(--ink4)] transition-colors hover:text-brand">
              Edit line / RAG
            </button>
          </>
        )}
        {error && <span className="flex items-center gap-1 text-[11px] text-[var(--bad)]"><ShieldAlert className="size-3" /> {error}</span>}
      </div>
    </div>
  );
}

export function MyWeekQueue({ rows, scope }: { rows: Row[]; scope: "owned" | "oversight" }) {
  const pending = rows.filter((r) => !(r.confirmed && r.sentToHead)).length;

  if (rows.length === 0) {
    return (
      <div className={`${CARD} p-8 text-center`} style={{ background: "var(--cardbg)" }}>
        <p className="text-[13px] font-semibold text-[var(--qink)]">No projects to report on.</p>
        <p className="mt-1 text-[12px] text-[var(--ink4)]">You don&apos;t lead any active projects this week.</p>
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`} style={{ background: "var(--cardbg)" }}>
      <header className="flex items-baseline gap-2 border-b border-[var(--hair2)] p-[12px_16px]">
        <h2 className="font-heading text-[14px] rv:text-heading-xs font-bold text-[var(--qink)]">
          {scope === "owned" ? "Your projects" : "Estate — read-only where you don't run it"}
        </h2>
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink4)]">
          {pending > 0 ? `${pending} to report` : "all reported"}
        </span>
      </header>
      <div className="flex flex-col">
        {rows.map((r) => (
          <RowCard key={r.projectId} row={r} />
        ))}
      </div>
    </div>
  );
}

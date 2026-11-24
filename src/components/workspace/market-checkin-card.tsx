"use client";

import { useState } from "react";
import { MarketCheckInFormSchema } from "@/lib/workspace-schema";
import { readApiError } from "@/lib/form-errors";
import { FieldError } from "@/components/ui/drawer";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CARD, COMPACT_PRIMARY, FIELD_INVALID, RAG_TOKEN } from "@/lib/surface";

// The market check-in (docs/18 §3.1): one narrative paragraph of focus & blockers plus
// a RAG, per project × market per week. The track's % stays derived from gate state —
// this card is only for what a human must say. Read-only without the governance gate.

const RAGS = ["Green", "Amber", "Red"] as const;

export function MarketCheckInCard({
  projectId,
  orgUnitId,
  initial,
  canGovern,
}: {
  projectId: string;
  orgUnitId: string;
  initial: { narrative: string; rag: string; isoWeek: string } | null;
  canGovern: boolean;
}) {
  const router = useRouter();
  const [narrative, setNarrative] = useState(initial?.narrative ?? "");
  const [rag, setRag] = useState<string>(initial?.rag ?? "Green");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // docs/08 § Errors: the note's problem shows on the field; Save stays enabled except while sending.
  const fe = useFieldErrors({ schema: MarketCheckInFormSchema, values: { narrative }, idPrefix: "market-checkin" });

  const save = async () => {
    setError(null);
    if (!fe.validate()) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/markets/${orgUnitId}/checkin`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim(), rag }),
    });
    if (!res.ok) {
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not save.");
      if (fields.narrative) fe.setServerErrors({ narrative: fields.narrative });
      else setError(message);
    } else {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    }
    setBusy(false);
  };

  return (
    <div className={`${CARD} flex flex-col`} style={{ background: "var(--cardbg)" }}>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]">
        <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Focus &amp; blockers</span>
        <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">
          {initial?.isoWeek ?? "this week"}
        </span>
        <span
          className="ml-auto rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
          style={{ color: `var(${RAG_TOKEN[rag]})`, background: `color-mix(in oklab, var(${RAG_TOKEN[rag]}) 10%, transparent)` }}
        >
          {rag}
        </span>
      </div>

      {canGovern ? (
        <div className="flex flex-col gap-2.5 p-[12px_16px]">
          <textarea
            {...fe.bind("narrative")}
            aria-label="Focus and blockers"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={5}
            maxLength={1000}
            placeholder="What is this market focused on, and what is in the way?"
            className={`w-full resize-y rounded-[10px] border border-[var(--w07)] bg-[var(--wash)] p-2.5 text-[12.5px] text-[var(--ink2)] outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none ${FIELD_INVALID}`}
          />
          {fe.errors.narrative && <FieldError id={`${fe.idOf("narrative")}-error`}>{fe.errors.narrative}</FieldError>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-[var(--w07)] bg-[var(--wash)] p-0.5">
              {RAGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRag(r)}
                  aria-pressed={rag === r}
                  className="rounded-full px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[.8px] transition-colors"
                  style={
                    rag === r
                      ? { background: `var(${RAG_TOKEN[r]})`, color: "var(--onbrand)" }
                      : { color: "var(--ink4)" }
                  }
                >
                  {r}
                </button>
              ))}
            </span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className={`ml-auto ${COMPACT_PRIMARY}`}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {saved ? "Saved" : "Save Check-in"}
            </button>
          </div>
          {error && <p role="alert" className="text-[11.5px] text-[var(--bad)]">{error}</p>}
        </div>
      ) : (
        <div className="p-[12px_16px]">
          {narrative ? (
            <p className="text-[12.5px] leading-relaxed text-[var(--ink2)]">{narrative}</p>
          ) : (
            <p className="text-[12px] text-[var(--ink5)]">No check-in for this market yet this week.</p>
          )}
        </div>
      )}
    </div>
  );
}

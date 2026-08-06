"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RAG_TOKEN } from "@/lib/surface";

// Friday check-in (M2, docs/16 §7): the system drafts the week from live data; the lead
// reads the bullets, writes ONE line, confirms — under two minutes. A RAG override needs
// a reason, shows as a "lead override" chip, and expires after 7 days.

interface CheckInJson {
  isoWeek: string;
  status: "Draft" | "Confirmed";
  computedRag: string;
  effectiveRag: string;
  lines: string[];
  narrative: string | null;
  ragOverride: string | null;
  overrideReason: string | null;
  overrideExpiresAt: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  submittedToHeadAt: string | null;
  canConfirm: boolean;
}

function RagChip({ rag, label }: { rag: string; label?: string }) {
  const tok = RAG_TOKEN[rag] ?? "--ink4";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 font-mono text-[10px] font-bold tracking-[.5px]"
      style={{ color: `var(${tok})`, borderColor: `color-mix(in oklab, var(${tok}) 35%, transparent)`, background: `color-mix(in oklab, var(${tok}) 9%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: `var(${tok})` }} />
      {label ?? rag.toUpperCase()}
    </span>
  );
}

export function CheckInCard({ projectId }: { projectId: string }) {
  const [ci, setCi] = useState<CheckInJson | null>(null);
  const [narrative, setNarrative] = useState("");
  const [override, setOverride] = useState<string>("Computed");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/projects/${projectId}/checkin`).then((r) => r.json()).catch(() => null);
    if (d?.data) {
      setCi(d.data);
      setNarrative(d.data.narrative ?? "");
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!ci) return null;

  const overridden = !!(ci.ragOverride && ci.overrideExpiresAt && new Date(ci.overrideExpiresAt) > new Date());
  const confirm = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        narrative: narrative.trim(),
        ...(override !== "Computed" ? { ragOverride: override, overrideReason: reason.trim() } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setCi(d.data);
    } else {
      const d = await res.json().catch(() => null);
      setError(d?.error?.message ?? "Could not confirm the check-in.");
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border border-[var(--w07)] bg-[var(--qcard)] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] rv:text-heading-xs font-bold text-[var(--qink)]">Friday check-in</h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[1.2px] text-[var(--ink4)]">{ci.isoWeek}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {overridden && ci.status === "Confirmed" && <RagChip rag={ci.effectiveRag} label={`LEAD OVERRIDE · ${ci.effectiveRag.toUpperCase()}`} />}
          <RagChip rag={ci.computedRag} label={`COMPUTED · ${ci.computedRag.toUpperCase()}`} />
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {ci.lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-[12px] leading-[1.5] text-[var(--ink2)]">
            <span className="mt-[7px] size-1 flex-none rounded-full bg-[var(--ink4)]" />
            {line}
          </li>
        ))}
      </ul>

      {ci.status === "Confirmed" ? (
        <div className="flex flex-col gap-1 rounded-[8px] border border-[var(--w06)] bg-[var(--wash)] p-2.5">
          <p className="text-[12.5px] leading-[1.5] text-[var(--qink)]">{ci.narrative}</p>
          {overridden && ci.overrideReason && (
            <p className="flex items-center gap-1.5 text-[10.5px] text-[var(--warn)]">
              <ShieldAlert className="size-3" /> Override: {ci.overrideReason} — expires{" "}
              {new Date(ci.overrideExpiresAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </p>
          )}
          <p className="text-[10.5px] text-[var(--ink5)]">
            Confirmed by {ci.confirmedByName ?? "the lead"} · {ci.confirmedAt ? new Date(ci.confirmedAt).toLocaleString() : ""}
          </p>
        </div>
      ) : ci.canConfirm ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={2}
            placeholder="One line in your own words — what should leadership take away this week?"
            className="resize-none rounded-[8px] border border-ink-4 bg-background p-2.5 text-xs text-foreground outline-none focus:border-brand"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={override}
              onValueChange={(v) => v && setOverride(v)}
              items={{ Computed: "Computed RAG", Green: "Override: Green", Amber: "Override: Amber", Red: "Override: Red" }}
            >
              <SelectTrigger className="h-8 w-[170px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Computed">Computed RAG</SelectItem>
                {(["Green", "Amber", "Red"] as const).map((r) => (
                  <SelectItem key={r} value={r}>
                    <span className="mr-2 inline-block size-2 flex-none rounded-full align-middle" style={{ background: `var(${RAG_TOKEN[r]})` }} />
                    Override: {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {override !== "Computed" && (
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why does your call differ? (required, expires in 7 days)"
                className="h-8 min-w-[220px] flex-1 rounded-[8px] border border-ink-4 bg-background px-2.5 text-[11px] text-foreground outline-none focus:border-brand"
              />
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={saving || !narrative.trim() || (override !== "Computed" && reason.trim().length < 5)}
              className="ml-auto flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3.5 py-1.5 text-xs font-bold text-[var(--onbrand)] disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" /> {saving ? "Confirming…" : "Confirm check-in"}
            </button>
          </div>
          {error && <p className="text-[11px] text-[var(--bad)]">{error}</p>}
        </div>
      ) : (
        <p className="text-[11px] text-[var(--ink4)]">
          Awaiting the lead&apos;s confirmation — the Friday report shows the computed status until then.
        </p>
      )}
      {/* M-P3a (docs/34): the chain's next rung — a confirmed report goes UP, explicitly. */}
      {ci.status === "Confirmed" && ci.canConfirm && (
        <div className="mt-1 flex items-center gap-2">
          {ci.submittedToHeadAt ? (
            <span className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, transparent)" }}>
              Sent to the Head of PMs · {new Date(ci.submittedToHeadAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const res = await fetch(`/api/projects/${projectId}/checkin/submit`, { method: "POST" });
                if (res.ok) void load();
                else setError((await res.json().catch(() => null))?.error?.message ?? "Could not send.");
              }}
              className="rounded-[8px] border border-[var(--brand)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--brand)]"
            >
              Send to the Head of PMs →
            </button>
          )}
          <span className="text-[10px] text-[var(--ink4)]">re-confirming requires a re-send</span>
        </div>
      )}
    </div>
  );
}

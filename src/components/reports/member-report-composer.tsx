"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Loader2, Send } from "lucide-react";
import type { MemberReportSection, MemberReportView } from "@/server/member-reports";

// The member weekly report composer (docs/18 §5.1.2). The edit step is mandatory UX:
// QUBIT drafts what it knows from the member's board, the member edits and adds what
// only they know, then SENDS. Nothing here auto-submits.

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)]";

interface Serialized extends Omit<MemberReportView, "submittedAt" | "acks"> {
  submittedAt: string | null;
  acks: { projectId: string; projectName: string; byName: string; comment: string | null; at: string }[];
}

export function MemberReportComposer() {
  const [report, setReport] = useState<Serialized | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState("");
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/member-reports");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { mine: Serialized };
      if (cancelled) return;
      setReport(json.mine);
      setNarrative(json.mine.narrative ?? "");
      setNotes(
        Object.fromEntries((json.mine.draft.sections ?? []).map((s) => [s.projectId, s.note ?? ""])),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!report) {
    return (
      <div className={`${CARD} flex items-center gap-2 p-4 text-[12px] text-[var(--ink5)]`} style={{ background: "var(--cardbg)" }}>
        <Loader2 className="size-3.5 animate-spin" /> Loading your week…
      </div>
    );
  }

  const sections = report.draft.sections ?? [];
  const editable = report.status === "Draft";

  const save = async (submit = false) => {
    setBusy(submit ? "submit" : "save");
    setError(null);
    const patch = await fetch("/api/member-reports", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ narrative: narrative.trim() || null, notes }),
    });
    if (!patch.ok) {
      setError((await patch.json().catch(() => null))?.error?.message ?? "Could not save.");
      setBusy(null);
      return;
    }
    let json = (await patch.json()) as { mine: Serialized };
    if (submit) {
      const res = await fetch("/api/member-reports/submit", { method: "POST" });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error?.message ?? "Could not send.");
        setBusy(null);
        return;
      }
      json = (await res.json()) as { mine: Serialized };
    }
    setReport(json.mine);
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`${CARD} flex flex-wrap items-center gap-3 p-4`} style={{ background: "var(--cardbg)" }}>
        <span className="font-heading text-[15px] font-bold text-[var(--qink)]">My weekly report</span>
        <span className="font-mono text-[9.5px] uppercase tracking-[1.2px] text-[var(--ink4)]">{report.isoWeek}</span>
        <StatusChip status={report.status} />
        {report.submittedAt && (
          <span className="font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink5)]">
            sent {new Date(report.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {sections.length === 0 ? (
        <div className={`${CARD} p-4 text-[12px] text-[var(--ink5)]`} style={{ background: "var(--cardbg)" }}>
          Nothing tracked moved on your projects this week — there is no report to send.
        </div>
      ) : (
        sections.map((s) => (
          <SectionCard
            key={s.projectId}
            section={s}
            note={notes[s.projectId] ?? ""}
            editable={editable}
            onNote={(v) => setNotes((prev) => ({ ...prev, [s.projectId]: v }))}
            ack={report.acks.find((a) => a.projectId === s.projectId) ?? null}
          />
        ))
      )}

      {sections.length > 0 && (
        <div className={`${CARD} flex flex-col gap-2.5 p-4`} style={{ background: "var(--cardbg)" }}>
          <label className="font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">
            Anything else your lead should know?
          </label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            disabled={!editable}
            rows={3}
            maxLength={1000}
            placeholder="Context the board can't show — risks you can see coming, help you need, a call you'd like made."
            className="w-full resize-y rounded-[10px] border border-[var(--w07)] bg-[var(--wash)] p-2.5 text-[12.5px] text-[var(--ink2)] outline-none focus:border-[var(--brand)] disabled:opacity-70"
          />
          {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}
          {editable ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void save(true)}
                disabled={busy !== null}
                className="flex items-center gap-2 rounded-[9px] bg-[var(--brand)] px-4 py-2 text-[12.5px] font-bold text-[var(--onbrand)] disabled:opacity-60"
              >
                {busy === "submit" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Send to my lead
              </button>
              <button
                type="button"
                onClick={() => void save(false)}
                disabled={busy !== null}
                className="rounded-[9px] border border-[var(--w07)] px-3 py-2 text-[12px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] disabled:opacity-60"
              >
                {busy === "save" ? "Saving…" : "Save draft"}
              </button>
            </div>
          ) : (
            <p className="font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink5)]">
              Sent — your lead sees this on their dashboard. Edits reopen next week.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tok = status === "Acknowledged" ? "--ok" : status === "Submitted" ? "--qinfo" : "--ink4";
  return (
    <span
      className="rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
      style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 10%, transparent)` }}
    >
      {status}
    </span>
  );
}

function SectionCard({
  section,
  note,
  editable,
  onNote,
  ack,
}: {
  section: MemberReportSection;
  note: string;
  editable: boolean;
  onNote: (v: string) => void;
  ack: { byName: string; comment: string | null; at: string } | null;
}) {
  return (
    <div className={CARD} style={{ background: "var(--cardbg)" }}>
      <div className="flex flex-wrap items-baseline gap-2.5 border-b border-[var(--hair)] p-[12px_16px]">
        <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">{section.projectName}</span>
        <span className="font-mono text-[9px] uppercase tracking-[1.2px] text-[var(--ink4)]">{section.projectCode}</span>
        {ack && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[.8px] text-[var(--ok)]">
            <CheckCheck className="size-3" /> acknowledged by {ack.byName}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-1 p-[10px_16px]">
        {section.lines.map((line, i) => (
          <li key={i} className="text-[12.5px] text-[var(--ink2)]">
            {line}
          </li>
        ))}
      </ul>
      {(section.done.length > 0 || section.doing.length > 0) && (
        <div className="grid grid-cols-1 gap-3 border-t border-[var(--hair2)] p-[10px_16px] md:grid-cols-2">
          <ItemList label="Done this week" items={section.done} />
          <ItemList label="Still in flight" items={section.doing} />
        </div>
      )}
      <div className="border-t border-[var(--hair2)] p-[10px_16px]">
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          disabled={!editable}
          rows={2}
          maxLength={1000}
          placeholder="Add more detail for this project…"
          className="w-full resize-y rounded-[10px] border border-[var(--w07)] bg-[var(--wash)] p-2 text-[12px] text-[var(--ink2)] outline-none focus:border-[var(--brand)] disabled:opacity-70"
        />
      </div>
      {ack?.comment && (
        <p className="border-t border-[var(--hair2)] p-[9px_16px] text-[11.5px] italic text-[var(--ink3)]">
          “{ack.comment}” — {ack.byName}
        </p>
      )}
    </div>
  );
}

function ItemList({ label, items }: { label: string; items: MemberReportSection["done"] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[8.5px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">{label}</span>
      {items.length === 0 && <span className="text-[11.5px] text-[var(--ink5)]">—</span>}
      {items.map((t) => (
        <span key={t.id} className="flex items-baseline gap-1.5 text-[11.5px] text-[var(--ink3)]">
          <span className="min-w-0 flex-1 truncate">{t.title}</span>
          {t.aging && <span className="flex-none font-mono text-[8.5px] font-bold text-[var(--warn)]">{t.ageBusinessDays}d</span>}
        </span>
      ))}
    </div>
  );
}

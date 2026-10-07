"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { isoWeekId, isoWeekMonday, shiftIsoWeek, weekRange } from "@/lib/iso-week";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FOCUS, PRIMARY, QUIET, SECONDARY, ragChipStyle } from "@/lib/surface";
import type { Rag } from "@/server/health";

/**
 * Reports › This week — upload the weekly status report (Word, Excel or PDF), review how
 * each row maps to a project, fill the drafts. Sending stays the queue's own action.
 */

interface PreviewRow {
  line: number;
  project: string;
  status: Rag | null;
  stage: string;
  update: string;
  warnings: string[];
  match: { projectId: string | null; confidence: "exact" | "suggested" | "none" };
  alreadySent: boolean;
}
interface Preview {
  format: "docx" | "xlsx" | "pdf" | "pptx";
  preparedBy: string | null;
  reportDate: string | null;
  isoWeek: string;
  past: boolean;
  rows: PreviewRow[];
  projects: { id: string; code: string; name: string }[];
  warnings: string[];
  fileName: string;
  base64: string;
}
interface ApplyRow {
  projectId: string;
  code: string;
  outcome: "drafted" | "resent" | "sent" | "skipped" | "error";
  message?: string;
  attached: boolean;
  gates?: string | null;
}
interface Draft {
  projectId: string | null;
  rag: Rag;
  stage: string;
  narrative: string;
  /** Already sent this week → replace it and resend. */
  resend: boolean;
}

const RAGS: Rag[] = ["Green", "Amber", "Red"];
const INPUT = `rounded-[8px] border border-[var(--input)] bg-background px-2.5 py-1.5 text-[12.5px] text-foreground focus:border-brand ${FOCUS}`;

type WeekMode = "this" | "last" | "custom";

export function StatusUploadDialog({ open, onOpenChange, onApplied }: { open: boolean; onOpenChange: (o: boolean) => void; onApplied: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  // Which week the report is for: this week by default, or a past one.
  const [weekMode, setWeekMode] = useState<WeekMode>("this");
  const [customDate, setCustomDate] = useState("");
  const thisWeek = isoWeekId(new Date());
  const week = weekMode === "this" ? thisWeek : weekMode === "last" ? shiftIsoWeek(thisWeek, -1) : customDate ? isoWeekId(new Date(`${customDate}T12:00:00Z`)) : null;
  const weekPast = Boolean(week && week !== thisWeek);
  const weekLabel = (w: string) => `Week ${w.split("-W")[1]} · ${weekRange(isoWeekMonday(w))}`;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState<"read" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApplyRow[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setDrafts({});
    setResults(null);
    setError(null);
    setWeekMode("this");
    setCustomDate("");
  };

  async function read(file: File | undefined) {
    if (!file) return;
    setBusy("read");
    setError(null);
    setResults(null);
    const fd = new FormData();
    fd.append("file", file);
    if (week) fd.append("week", week);
    const res = await fetch("/api/reports/status-upload", { method: "POST", body: fd });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "The file could not be read.");
      return;
    }
    const p = body.data as Preview;
    setPreview(p);
    setDrafts(
      Object.fromEntries(
        p.rows.map((r) => [r.line, { projectId: r.match.projectId, rag: r.status ?? "Amber", stage: r.stage, narrative: r.update, resend: r.alreadySent }]),
      ),
    );
  }

  const chosen = preview ? preview.rows.filter((r) => drafts[r.line]?.projectId && drafts[r.line]!.narrative.trim() && (!r.alreadySent || drafts[r.line]!.resend)) : [];
  const resending = chosen.filter((r) => r.alreadySent).length;
  const dupes = new Set(chosen.map((r) => drafts[r.line]!.projectId).filter((id, i, arr) => arr.indexOf(id) !== i));

  async function apply() {
    if (!preview) return;
    setBusy("apply");
    setError(null);
    const res = await fetch("/api/reports/status-upload/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        week: preview.isoWeek,
        preparedBy: preview.preparedBy,
        reportDate: preview.reportDate,
        rows: chosen.map((r) => {
          const d = drafts[r.line]!;
          return { projectId: d.projectId, rag: d.rag, stage: d.stage.trim(), narrative: d.narrative.trim(), resend: r.alreadySent && d.resend };
        }),
        ...(attach ? { file: { name: preview.fileName, format: preview.format, base64: preview.base64 } } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(body?.error?.message ?? "Could not fill the drafts.");
      return;
    }
    setResults(body.data as ApplyRow[]);
    onApplied();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[920px]">
        <DialogHeader>
          <DialogTitle>Upload this week&apos;s status report</DialogTitle>
          <DialogDescription>
            Word, Excel or PDF with one row per project (Project · Status · Stage · Update and Outlook), or a PowerPoint one-pager per project. Each row fills
            that project&apos;s weekly update for you to check — nothing goes to the Head until you send it. A past week&apos;s report is sent as you review it
            here.
          </DialogDescription>
        </DialogHeader>

        {!preview && (
          <div className="flex flex-col items-start gap-3">
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="mb-1.5 text-[12px] font-semibold text-[var(--ink3)]">Report for</legend>
              {(
                [
                  ["this", "This week"],
                  ["last", "Last week"],
                  ["custom", "Past report · pick a date"],
                ] as [WeekMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setWeekMode(m)}
                  aria-pressed={weekMode === m}
                  className={`${weekMode === m ? PRIMARY : SECONDARY} px-3 py-1.5 text-[12.5px]`}
                >
                  {label}
                </button>
              ))}
              {weekMode === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setCustomDate(e.target.value)}
                  aria-label="A date in the week the report is for"
                  className={INPUT}
                />
              )}
            </fieldset>
            <p className="text-[12px] text-[var(--ink4)]">
              {week ? weekLabel(week) : "Pick a date in the week the report is for."}
              {weekPast && " — a past week: rows are sent to the Head as you review them here."}
            </p>
            <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx,.pdf" className="sr-only" aria-label="Status report file" onChange={(e) => void read(e.target.files?.[0])} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy !== null || !week} className={PRIMARY}>
              <Upload className="size-3.5" aria-hidden /> {busy === "read" ? "Reading…" : "Choose file"}
            </button>
            {error && (
              <p role="alert" className="text-[12px] text-[var(--bad)]">
                {error}
              </p>
            )}
          </div>
        )}

        {preview && !results && (
          <div className="flex flex-col gap-3">
            <p className="text-[12.5px] text-[var(--ink3)]">
              <b className="text-[var(--qink)]">{preview.fileName}</b>
              {preview.preparedBy && <> · prepared by {preview.preparedBy}</>}
              {preview.reportDate && <> · {preview.reportDate}</>} · {preview.rows.length} {preview.rows.length === 1 ? "row" : "rows"} · {weekLabel(preview.isoWeek)}
              {preview.past && <span className="ml-1 font-semibold text-[var(--warn)]">· past week — sent as reviewed here</span>}
              <button type="button" onClick={reset} className={`${QUIET} ml-2`}>
                Choose another file
              </button>
            </p>
            {preview.warnings.map((w) => (
              <p key={w} className="rounded-[8px] px-3 py-2 text-[12px]" style={{ color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}>
                {w}
              </p>
            ))}
            {preview.rows.length > 0 && (
              <div className="overflow-x-auto rounded-[10px] border border-[var(--w08)]">
                <table className="w-full min-w-[840px] border-collapse text-left text-[12.5px]">
                  <thead>
                    <tr className="font-mono text-[9px] font-bold uppercase tracking-[1px] text-[var(--ink4)]">
                      <th className="border-b border-[var(--hair)] px-3 py-2">In the file</th>
                      <th className="border-b border-[var(--hair)] px-3 py-2">Project</th>
                      <th className="border-b border-[var(--hair)] px-3 py-2">RAG</th>
                      <th className="border-b border-[var(--hair)] px-3 py-2">Stage → status note</th>
                      <th className="border-b border-[var(--hair)] px-3 py-2">Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => {
                      const d = drafts[r.line]!;
                      const dupe = d.projectId ? dupes.has(d.projectId) : false;
                      return (
                        <tr key={r.line} className="border-b border-[var(--hair2)] align-top last:border-0">
                          <td className="px-3 py-2">
                            <span className="font-medium text-[var(--qink)]">{r.project}</span>
                            {r.match.confidence === "suggested" && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={ragChipStyle("Amber")}>check</span>}
                            {r.match.confidence === "none" && !r.alreadySent && <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={ragChipStyle("Red")}>no match</span>}
                            {r.warnings.map((w) => (
                              <p key={w} className="mt-1 text-[11px] text-[var(--warn)]">
                                {w}
                              </p>
                            ))}
                            {dupe && <p className="mt-1 text-[11px] text-[var(--bad)]">Two rows point at the same project.</p>}
                            {r.alreadySent && (
                              <label className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--qink)]">
                                <input type="checkbox" checked={d.resend} onChange={(e) => setDrafts((all) => ({ ...all, [r.line]: { ...d, resend: e.target.checked } }))} className="size-3.5 accent-[var(--brand)]" />
                                Replace the sent update &amp; resend
                              </label>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <select value={d.projectId ?? ""} onChange={(e) => setDrafts((all) => ({ ...all, [r.line]: { ...d, projectId: e.target.value || null } }))} aria-label={`Project for ${r.project}`} className={`${INPUT} w-[200px]`}>
                              <option value="">Skip this row</option>
                              {preview.projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code} · {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <fieldset className="flex gap-1" aria-label={`RAG for ${r.project}`}>
                              {RAGS.map((g) => (
                                <label key={g} className="cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-semibold has-[:checked]:ring-2 has-[:checked]:ring-[var(--brand)]" style={ragChipStyle(g)}>
                                  <input type="radio" name={`rag-${r.line}`} value={g} checked={d.rag === g} onChange={() => setDrafts((all) => ({ ...all, [r.line]: { ...d, rag: g } }))} className="sr-only" />
                                  {g}
                                </label>
                              ))}
                            </fieldset>
                          </td>
                          <td className="px-3 py-2">
                            <input value={d.stage} maxLength={200} onChange={(e) => setDrafts((all) => ({ ...all, [r.line]: { ...d, stage: e.target.value } }))} aria-label={`Stage for ${r.project}`} className={`${INPUT} w-[180px]`} />
                          </td>
                          <td className="px-3 py-2">
                            <textarea value={d.narrative} maxLength={500} rows={3} onChange={(e) => setDrafts((all) => ({ ...all, [r.line]: { ...d, narrative: e.target.value } }))} aria-label={`Update for ${r.project}`} className={`${INPUT} w-[280px] resize-y`} />
                            <p className="mt-0.5 text-right text-[10.5px] text-[var(--ink5)]">{d.narrative.length}/500</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[12.5px] text-[var(--ink2)]">
                <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="size-3.5 accent-[var(--brand)]" />
                Attach the file to each project&apos;s Documents
              </label>
              <button type="button" onClick={() => void apply()} disabled={busy !== null || chosen.length === 0 || dupes.size > 0} className={`${PRIMARY} ml-auto`}>
                {busy === "apply"
                  ? "Filling…"
                  : preview.past
                    ? `Send ${chosen.length} for Week ${preview.isoWeek.split("-W")[1]}`
                    : resending > 0
                      ? `Fill ${chosen.length - resending} ${chosen.length - resending === 1 ? "draft" : "drafts"} · resend ${resending}`
                      : `Fill ${chosen.length} ${chosen.length === 1 ? "draft" : "drafts"}`}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-[12px] text-[var(--bad)]">
                {error}
              </p>
            )}
          </div>
        )}

        {results && (
          <div className="flex flex-col gap-2">
            <ul className="flex flex-col">
              {results.map((r) => (
                <li key={r.projectId} className="flex flex-wrap items-center gap-2 border-t border-[var(--hair2)] py-1.5 text-[12.5px] first:border-0">
                  <span className="font-mono text-[11px] font-semibold text-[var(--ink3)]">{r.code}</span>
                  <span style={{ color: r.outcome === "drafted" || r.outcome === "resent" || r.outcome === "sent" ? "var(--ok)" : r.outcome === "skipped" ? "var(--warn)" : "var(--bad)" }}>
                    {r.outcome === "drafted" ? "Draft filled" : r.outcome === "resent" ? "Replaced & resent to the Head" : r.outcome === "sent" ? "Sent to the Head" : r.message}
                    {(r.outcome === "drafted" || r.outcome === "resent" || r.outcome === "sent") && r.attached ? " · report attached" : ""}
                    {r.gates ? ` · gates: ${r.gates}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {preview?.past ? (
              <p className="text-[12.5px] text-[var(--ink3)]">
                Those rows are now in Week {preview.isoWeek.split("-W")[1]}&apos;s inbox and roll-up.{" "}
                <Link href={`/reports?week=${preview.isoWeek}`} className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline">
                  Open that week →
                </Link>
              </p>
            ) : (
              <p className="text-[12.5px] text-[var(--ink3)]">Each filled line now sits in the queue with its RAG from the report — check it and press Confirm &amp; send, or Confirm &amp; send all. Resent rows are already with the Head.</p>
            )}
            <div>
              <button type="button" onClick={() => onOpenChange(false)} className={SECONDARY}>
                Back to the queue
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

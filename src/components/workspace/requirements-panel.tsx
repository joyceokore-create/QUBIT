"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { CoverageReport, RequirementCandidate, RequirementRow } from "@/server/requirements";

// Requirements + traceability (docs/16 §6). Extraction PROPOSES; this screen is the
// human gate — "Q found this in your BRD" — and only ticked items become real. Coverage
// names the uncovered anchors ("URS §3.2 has no covering task") rather than reporting a
// bare percentage nobody can act on.

const CARD = "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)]";

interface Doc {
  id: string;
  title: string;
  kind: string;
}

export function RequirementsPanel({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<RequirementRow[] | null>(null);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [candidates, setCandidates] = useState<RequirementCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [sourceDocId, setSourceDocId] = useState<string | null>(null);
  const [usedAi, setUsedAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/requirements`);
    if (!res.ok) return;
    const json = await res.json();
    setRows(json.requirements);
    setCoverage(json.coverage);
    setCanEdit(json.canEdit);
  }, [projectId]);

  useEffect(() => {
    void load();
    void (async () => {
      const r = await fetch(`/api/projects/${projectId}/documents`).then((x) => (x.ok ? x.json() : null));
      // Only requirement-bearing documents are worth reading.
      setDocs((r?.data ?? []).filter((d: Doc) => ["BRD", "URS", "SRS"].includes(d.kind)));
    })();
  }, [projectId, load]);

  const propose = async (documentId: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/requirements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not read that document.");
    } else {
      const json = await res.json();
      setCandidates(json.candidates);
      setUsedAi(json.usedAi);
      setSourceDocId(documentId);
      setPicked(new Set(json.candidates.map((_: unknown, i: number) => i))); // pre-ticked, still reviewable
    }
    setBusy(false);
  };

  const accept = async () => {
    if (!candidates || !sourceDocId) return;
    setBusy(true);
    const accepted = [...picked].map((i) => candidates[i]).filter(Boolean);
    const res = await fetch(`/api/projects/${projectId}/requirements`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ documentId: sourceDocId, accepted }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not save.");
    } else {
      const json = await res.json();
      setRows(json.requirements);
      setCoverage(json.coverage);
      setCandidates(null);
      setSourceDocId(null);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`${CARD} flex flex-col gap-2.5 p-4`} style={{ background: "var(--cardbg)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">Requirements</span>
          {coverage && coverage.total > 0 && (
            <span className="font-mono text-[9.5px] font-bold tabular-nums text-[var(--qink)]">
              {coverage.pct}% covered ({coverage.covered}/{coverage.total})
            </span>
          )}
          {canEdit && docs.length > 0 && !candidates && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              {docs.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void propose(d.id)}
                  className="flex items-center gap-1 rounded-full border border-[var(--w10)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--ink3)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                  Read {d.kind}
                </button>
              ))}
            </span>
          )}
        </div>

        {coverage && coverage.total > 0 && (
          <div className="h-[4px] overflow-hidden rounded-full bg-[var(--wash2)]">
            <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${coverage.pct}%` }} />
          </div>
        )}
        {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}

        {!rows ? (
          <p className="flex items-center gap-2 text-[11.5px] text-[var(--ink5)]">
            <Loader2 className="size-3 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[11.5px] text-[var(--ink5)]">
            {docs.length === 0
              ? "No BRD, URS or SRS in the register yet — add one and Q can read requirements out of it."
              : "No requirements captured yet. Read a document above and approve what Q finds."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start gap-2.5 border-b border-[var(--hair2)] py-2 last:border-0">
                <span
                  className="mt-[2px] flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold"
                  style={{
                    color: `var(${r.covered ? "--ok" : "--warn"})`,
                    background: `color-mix(in oklab, var(${r.covered ? "--ok" : "--warn"}) 10%, transparent)`,
                  }}
                >
                  {r.ref}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{r.text}</span>
                  <span className="block font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">
                    {r.sectionAnchor ? `${r.sectionAnchor} · ` : ""}
                    {r.sourceDocumentTitle ?? "no source"}
                    {r.covered ? ` · ${r.linkedTasks.length} covering task${r.linkedTasks.length === 1 ? "" : "s"}` : " · uncovered"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {coverage && coverage.uncovered.length > 0 && (
          <p className="font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--warn)]">
            {coverage.uncovered.length} uncovered ·{" "}
            {coverage.uncovered
              .slice(0, 3)
              .map((u) => `${u.sectionAnchor ?? u.ref} has no covering task`)
              .join(" · ")}
          </p>
        )}
      </div>

      {/* The human gate (§6): nothing here is real until it is approved. */}
      {candidates && (
        <div className={`${CARD} flex flex-col gap-2.5 p-4`} style={{ background: "var(--cardbg)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-[13.5px] font-bold text-[var(--qink)]">
              Q found {candidates.length} requirement{candidates.length === 1 ? "" : "s"} in your document
            </span>
            <span className="font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink4)]">
              {usedAi ? "AI-read" : "pattern-read"} · nothing is saved until you approve
            </span>
          </div>
          {candidates.length === 0 ? (
            <p className="text-[11.5px] text-[var(--ink5)]">
              Nothing in that document reads like a requirement — check it has &ldquo;must / shall&rdquo; statements.
            </p>
          ) : (
            <ul className="flex flex-col">
              {candidates.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 border-b border-[var(--hair2)] py-2 last:border-0">
                  <button
                    type="button"
                    onClick={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    aria-pressed={picked.has(i)}
                    aria-label={picked.has(i) ? "Approve this requirement" : "Skip this requirement"}
                    className="mt-[1px] flex size-4 flex-none items-center justify-center rounded-[4px] border"
                    style={{
                      borderColor: picked.has(i) ? "var(--brand)" : "var(--w10)",
                      background: picked.has(i) ? "var(--brand)" : "transparent",
                      color: "var(--onbrand)",
                    }}
                  >
                    {picked.has(i) ? <Check className="size-3" /> : null}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] leading-[1.45] text-[var(--ink2)]">{c.text}</span>
                    {c.sectionAnchor && (
                      <span className="block font-mono text-[8.5px] uppercase tracking-[.6px] text-[var(--ink4)]">
                        {c.sectionAnchor}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void accept()}
              disabled={busy || picked.size === 0}
              className="flex items-center gap-1.5 rounded-[9px] bg-[var(--brand)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--onbrand)] disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Approve {picked.size} of {candidates.length}
            </button>
            <button
              type="button"
              onClick={() => {
                setCandidates(null);
                setSourceDocId(null);
              }}
              className="flex items-center gap-1 text-[11.5px] font-semibold text-[var(--ink4)] hover:text-[var(--qink)]"
            >
              <X className="size-3" /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

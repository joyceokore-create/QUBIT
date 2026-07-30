"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CheckpointState, ProjectCheckpoints, TemplateOption } from "@/server/checkpoints";

// The project's gate matrix (docs/18 §2 + §7 edit surface). Humans set gate STATE; the
// percentage underneath is derived and never typed — that's the whole point of moving
// the slide's hand-maintained numbers into the system.

const STATES: CheckpointState[] = ["NotStarted", "InProgress", "Done", "Blocked"];
const STATE_TOK: Record<CheckpointState, string> = {
  Done: "--ok",
  InProgress: "--qinfo",
  Blocked: "--bad",
  NotStarted: "--ink4",
};
const STATE_LABEL: Record<CheckpointState, string> = {
  Done: "Done",
  InProgress: "In progress",
  Blocked: "Blocked",
  NotStarted: "Not started",
};

interface Payload extends ProjectCheckpoints {
  templates: TemplateOption[];
  canGovern: boolean;
}

export function CheckpointMatrix({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // docs/16 §6 — a gate whose checklist is unmet soft-blocks: we surface what is
  // missing and ask for a reason rather than silently refusing or silently allowing.
  const [gateBlock, setGateBlock] = useState<{ checkpointId: string; unmet: { key: string; label: string; detail: string | null }[] } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/checkpoints`);
      if (!res.ok || cancelled) return;
      setData(await res.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-[12px] text-[var(--ink5)]">
        <Loader2 className="size-3.5 animate-spin" /> Loading checkpoints…
      </p>
    );
  }

  const patch = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/checkpoints`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 409) {
      // Gate unmet — show the checklist and offer the override rather than failing flat.
      const err = (await res.json().catch(() => null))?.error;
      setGateBlock({ checkpointId: String(body.checkpointId), unmet: err?.unmet ?? [] });
      setError(null);
    } else if (!res.ok) {
      setError((await res.json().catch(() => null))?.error?.message ?? "Could not save.");
    } else {
      const next = await res.json();
      setData((prev) => (prev ? { ...prev, ...next } : prev));
      setGateBlock(null);
      setOverrideReason("");
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--ink4)]">Checkpoints</span>
        {data.templateId && (
          <span className="font-mono text-[9.5px] font-bold tabular-nums text-[var(--qink)]">{data.progress}%</span>
        )}
        {data.canGovern ? (
          <Select
            value={data.templateId ?? "none"}
            onValueChange={(v) => void patch({ templateId: v === "none" ? null : v }, "template")}
          >
            <SelectTrigger className="ml-auto h-7 w-[168px] text-[11px]" aria-label="Checkpoint template">
              <SelectValue placeholder="No template">{data.templateName ?? "No template"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No template</SelectItem>
              {data.templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.checkpointCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          data.templateName && (
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[.8px] text-[var(--ink5)]">{data.templateName}</span>
          )
        )}
      </div>

      {!data.templateId ? (
        <p className="text-[11.5px] text-[var(--ink5)]">
          No checkpoint template yet — progress falls back to the per-subsidiary rollup until one is chosen.
        </p>
      ) : (
        <>
          {/* Derived bar: the number the dashboards read, computed from the states below. */}
          <div className="h-[4px] overflow-hidden rounded-full bg-[var(--wash2)]">
            <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${data.progress}%` }} />
          </div>
          <ol className="flex flex-col">
            {data.rows.map((row) => (
              <li key={row.checkpointId} className="flex items-center gap-2 border-b border-[var(--hair2)] py-1.5 last:border-0">
                <span
                  className="size-2 flex-none rounded-full"
                  style={{ background: `var(${STATE_TOK[row.state]})` }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink2)]">{row.name}</span>
                {busy === row.checkpointId && <Loader2 className="size-3 animate-spin text-[var(--ink4)]" />}
                {row.overrideReason && (
                  <span
                    title={`Gate closed early: ${row.overrideReason}`}
                    className="flex flex-none items-center gap-1 rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--warn)]"
                    style={{ background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}
                  >
                    <ShieldAlert className="size-2.5" /> overridden
                  </span>
                )}
                {data.canGovern ? (
                  <Select
                    value={row.state}
                    onValueChange={(v) => void patch({ checkpointId: row.checkpointId, state: v }, row.checkpointId)}
                  >
                    <SelectTrigger className="h-6 w-[116px] text-[10.5px]" aria-label={`${row.name} state`}>
                      <SelectValue>{STATE_LABEL[row.state]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATE_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[.6px]" style={{ color: `var(${STATE_TOK[row.state]})` }}>
                    {STATE_LABEL[row.state]}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {/* docs/16 §6 — the gate soft-blocks: say exactly what is missing, then let a
              governed user proceed with a written reason that is recorded on the row. */}
          {gateBlock && (
            <div
              className="flex flex-col gap-2 rounded-[10px] border p-3"
              style={{ borderColor: "color-mix(in oklab, var(--warn) 35%, transparent)", background: "color-mix(in oklab, var(--warn) 6%, transparent)" }}
            >
              <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-[var(--warn)]">
                <TriangleAlert className="size-3" /> This gate is not satisfied yet
              </span>
              <ul className="flex flex-col gap-1">
                {gateBlock.unmet.map((r) => (
                  <li key={r.key} className="text-[12px] text-[var(--ink2)]">
                    {r.label}
                    {r.detail && <span className="text-[var(--ink4)]"> — {r.detail}</span>}
                  </li>
                ))}
              </ul>
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                maxLength={300}
                placeholder="Why is it being closed anyway? This is recorded."
                className="h-8 rounded-[8px] border border-[var(--w07)] bg-[var(--wash)] px-2.5 text-[12px] text-[var(--ink2)] outline-none focus:border-[var(--brand)]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={overrideReason.trim().length < 5 || busy !== null}
                  onClick={() =>
                    void patch(
                      { checkpointId: gateBlock.checkpointId, state: "Done", overrideReason: overrideReason.trim() },
                      gateBlock.checkpointId,
                    )
                  }
                  className="rounded-[8px] bg-[var(--warn)] px-3 py-1.5 text-[11.5px] font-bold text-[var(--onbrand)] disabled:opacity-60"
                >
                  Close gate with reason
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGateBlock(null);
                    setOverrideReason("");
                  }}
                  className="text-[11.5px] font-semibold text-[var(--ink4)] hover:text-[var(--qink)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {/* Blocked needs a linked blocker (§2) — say so rather than silently rejecting. */}
          <p className="font-mono text-[8.5px] uppercase tracking-[.8px] text-[var(--ink5)]">
            % is derived from these states · Blocked needs an open blocker · gates check their
            requirements before closing
          </p>
        </>
      )}
      {error && <p className="text-[11px] text-[var(--bad)]">{error}</p>}
    </div>
  );
}

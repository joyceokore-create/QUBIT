"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { FieldError } from "@/components/ui/drawer";
import { FIELD_INVALID } from "@/lib/surface";
import { readApiError } from "@/lib/form-errors";
import { moduleLabel as moduleLabelRule, StatusNoteFormSchema, ModuleLabelFormSchema } from "@/lib/workspace-schema";

// docs/18 §7 — the workspace edit surface for governance facts: pipeline stage,
// priority, portfolio (§0.5 — every project belongs to one), one-line status note.
// Humans update facts; the system derives numbers. Inline, optimistic, audited +
// evented server-side. Read-only render without the gate (§10 acceptance: test both
// ways). Gates come from can()/canWriteProject — never here.

import { PIPELINE_STAGES as STAGES, PROJECT_PRIORITIES as PRIORITIES } from "@/lib/project-enums";
const STAGE_TOKEN: Record<string, string> = { Exploring: "--qinfo", Evaluating: "--warn", Approved: "--ok", Paused: "--ink4" };

export function GovernanceEditor({
  projectId,
  pipelineStage,
  priority,
  statusNote,
  portfolioId,
  portfolios = [],
  budget = null,
  canGovern,
  shape,
}: {
  /** docs/38 — the product's shape; edits go through the same PATCH. */
  shape?: { instanceTagging: boolean; pmScope: string; moduleLabel: string };
  projectId: string;
  pipelineStage: string;
  priority: string;
  statusNote: string | null;
  portfolioId?: string | null;
  portfolios?: { id: string; name: string }[];
  /** docs/32 §0.2 — shown as the honest "typed in Phase C" placeholder when null. */
  budget?: string | null;
  canGovern: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(pipelineStage);
  const [prio, setPrio] = useState(priority);
  const [pf, setPf] = useState(portfolioId ?? "");
  const [note, setNote] = useState(statusNote ?? "");
  const [editingNote, setEditingNote] = useState(false);
  const [modLabel, setModLabel] = useState(shape?.moduleLabel ?? "");
  const [error, setError] = useState<string | null>(null);
  // docs/08 § Errors: a bad note / name shows under its own field; saving is never gated.
  const fe = useFieldErrors({ schema: StatusNoteFormSchema.merge(ModuleLabelFormSchema), values: { statusNote: note, moduleLabel: modLabel }, idPrefix: "gov" });

  const patch = async (body: Record<string, unknown>) => {
    setError(null);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { message, fields } = readApiError(await res.json().catch(() => null), "Could not save.");
      const onField = Object.fromEntries(Object.entries(fields).filter(([k]) => k === "statusNote" || k === "moduleLabel"));
      if (Object.keys(onField).length > 0) fe.setServerErrors(onField);
      else setError(message);
      return false;
    }
    router.refresh();
    return true;
  };

  const saveNote = () => {
    if (!fe.validate(["statusNote"])) return;
    void patch({ statusNote: note.trim() || null }).then((ok) => ok && setEditingNote(false));
  };

  const saveModuleLabel = () => {
    const b = fe.bind("moduleLabel");
    if (!shape) return;
    if (modLabel.trim() === "") return setModLabel(shape.moduleLabel); // nothing to save: put the current name back
    b.onBlur();
    const r = moduleLabelRule.safeParse(modLabel);
    if (r.success && r.data !== shape.moduleLabel) void patch({ moduleLabel: r.data });
  };

  const portfolioName = portfolios.find((p) => p.id === pf)?.name ?? null;

  if (!canGovern) {
    // Read-only render for everyone else — the facts stay visible, never editable.
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Stage" value={pipelineStage} tok={STAGE_TOKEN[pipelineStage] ?? "--ink4"} />
        <Chip label="Priority" value={priority} tok="--ink3" />
        {portfolioName && <Chip label="Portfolio" value={portfolioName} tok="--ink3" />}
        <Chip label="Budget" value={budget ?? "typed in Phase C"} tok={budget ? "--qink" : "--ink4"} />
        {statusNote && <p className="w-full text-[11.5px] italic text-[var(--ink3)]">“{statusNote}”</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={stage}
          onValueChange={(v) => {
            if (!v || v === stage) return;
            const prev = stage;
            setStage(v); // optimistic
            void patch({ pipelineStage: v }).then((ok) => !ok && setStage(prev));
          }}
        >
          <SelectTrigger className="h-7 w-[132px] text-[11px]" aria-label="Pipeline stage"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: `var(${STAGE_TOKEN[s]})` }} />
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={prio}
          onValueChange={(v) => {
            if (!v || v === prio) return;
            const prev = prio;
            setPrio(v);
            void patch({ priority: v }).then((ok) => !ok && setPrio(prev));
          }}
        >
          <SelectTrigger className="h-7 w-[104px] text-[11px]" aria-label="Priority"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* Portfolio move (docs/18 §0.5) — every project belongs to exactly one. */}
        {portfolios.length > 0 && (
          <Select
            value={pf}
            onValueChange={(v) => {
              if (!v || v === pf) return;
              const prev = pf;
              setPf(v);
              void patch({ portfolioId: v }).then((ok) => !ok && setPf(prev));
            }}
          >
            <SelectTrigger className="h-7 w-[150px] text-[11px]" aria-label="Portfolio">
              {/* Explicit display text: the value is a UUID, so the default fallback
                  (raw value) must never show. */}
              <SelectValue placeholder="Portfolio…">{portfolioName ?? "Portfolio…"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {/* docs/32 §0.2 — Budget is honest emptiness until money is typed (Phase C). */}
        <span className="ml-1 text-[11px] text-ink-3">
          Budget: <span className={budget ? "font-semibold text-foreground" : "text-ink-4"}>{budget ?? "typed in Phase C"}</span>
        </span>
      </div>
      {editingNote ? (
        <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <input
            {...fe.bind("statusNote")}
            aria-label="Status note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            autoFocus
            placeholder="One line for the pipeline table — what should the portfolio read this week?"
            className={`h-7 min-w-0 flex-1 rounded-[7px] border border-ink-4 bg-background px-2 text-[11.5px] text-foreground outline-none focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none ${FIELD_INVALID}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveNote();
              if (e.key === "Escape") setEditingNote(false);
            }}
          />
          <button
            type="button"
            aria-label="Save status note"
            onClick={saveNote}
            className="rounded p-1 text-[var(--ok)] hover:bg-[var(--wash)]"
          >
            <Check className="size-3.5" />
          </button>
        </div>
        {fe.errors.statusNote && <FieldError id={`${fe.idOf("statusNote")}-error`}>{fe.errors.statusNote}</FieldError>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingNote(true)}
          className="group flex items-center gap-1.5 text-left text-[11.5px] italic text-[var(--ink3)] hover:text-[var(--qink)]"
        >
          {note ? `“${note}”` : "Add a one-line status note…"}
          <Pencil className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
      {shape && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hair2)] pt-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[.8px] text-[var(--ink5)]">Shape</span>
          <Select value={shape.pmScope} onValueChange={(v) => v && void patch({ pmScope: v })}>
            <SelectTrigger className="h-7 w-[150px] text-[11px]" aria-label="PM scope"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="product">One PM for the product</SelectItem>
              <SelectItem value="instance">A lead per market</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink3)]">
            <input type="checkbox" checked={shape.instanceTagging} onChange={(e) => void patch({ instanceTagging: e.target.checked })} className="size-3.5 accent-[var(--brand)]" />
            Tag work by market and instance
          </label>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--ink3)]">
              Modules are called
              <input
                {...fe.bind("moduleLabel")}
                value={modLabel}
                onChange={(e) => setModLabel(e.target.value)}
                maxLength={30}
                aria-label="What this product calls its modules"
                onBlur={saveModuleLabel}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className={`h-7 w-[140px] rounded-[7px] border border-[var(--input)] bg-background px-2 text-[11px] text-foreground focus:border-[var(--ds-ink)] focus:ring-1 focus:ring-[var(--ds-ink)] focus:ring-offset-0 focus:outline-none ${FIELD_INVALID}`}
              />
            </label>
            {fe.errors.moduleLabel && <FieldError id={`${fe.idOf("moduleLabel")}-error`}>{fe.errors.moduleLabel}</FieldError>}
          </div>
        </div>
      )}
      {error && <p className="text-[11px] text-[var(--bad)]">{error}</p>}
    </div>
  );
}

function Chip({ label, value, tok }: { label: string; value: string; tok: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--w07)] px-2 py-0.5 font-mono text-[9.5px]">
      <span className="uppercase tracking-[.8px] text-[var(--ink5)]">{label}</span>
      <span className="font-bold" style={{ color: `var(${tok})` }}>{value}</span>
    </span>
  );
}

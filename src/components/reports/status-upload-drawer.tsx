"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Choice, DrawerFooter, DrawerFrame, DrawerHeader, DrawerSection, DrawerText, FieldError, FIELD_INPUT, Kv } from "@/components/ui/drawer";
import { Banner } from "@/components/ui/panel";
import { readApiError } from "@/lib/form-errors";
import { Chip, HealthPill, type ChipTone } from "@/components/ui/status-pill";
import { TextButton } from "@/components/ui/text-link";
import { FOCUS, PRIMARY, SECONDARY } from "@/lib/surface";
import { cn } from "@/lib/utils";
import { GATE_STATE_LABEL, resolveDelivery, type CatalogMarket } from "@/lib/status-report-delivery";
import type { CheckpointState } from "@/server/checkpoints";
import type { Preview, PreviewRow, WorkspaceProject } from "@/components/reports/status-workspace-model";

/**
 * Reports › Weekly Update › Upload Status Report — the shared drawer (design spec v2). Pick a
 * Word, Excel, PDF or PowerPoint report; QUBIT reads it (POST /api/reports/status-upload),
 * shows what it read per line, and asks what it could not place: which project a line is,
 * and which gate an unclear stage phrase means (optionally remembered for the tenant).
 * "Apply to Update" only prefills the cards — nothing is saved until a card is saved or sent.
 */

export interface Placement {
  row: PreviewRow;
  projectId: string;
  orgUnitId: string | null;
}
export interface StageAnswer {
  projectId: string;
  gateName: string | null;
  /** Phrases to remember as that gate, tenant-wide. */
  remember: string[];
}
export interface UploadResult {
  preview: Preview;
  attach: boolean;
  placements: Placement[];
  answers: StageAnswer[];
}

const GATE_TONE: Record<CheckpointState, ChipTone> = { Done: "ok", InProgress: "warn", Blocked: "bad", NotStarted: "muted" };
const NOT_A_GATE = "__none";
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function StatusUploadDrawer({
  week,
  weekLabel,
  projects,
  tenantName,
  onCreateProject,
  onApply,
  onClose,
}: {
  week: string | null;
  weekLabel: string;
  projects: WorkspaceProject[];
  tenantName: string;
  /** Create a project for a line no project matches; resolves to its id. */
  onCreateProject: (name: string) => Promise<{ id: string } | { error: string }>;
  onApply: (r: UploadResult) => void;
  onClose: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [creating, setCreating] = useState<number | null>(null);
  // docs/08 § Errors: a file that could not be read sits on the file picker; "nothing placed yet"
  // sits on the list of lines; a failed "create project" is form-level (banner at the top).
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [attach, setAttach] = useState(true);
  /** line → project id ("" = not placed yet, "skip" = left out). */
  const [placed, setPlaced] = useState<Record<number, string>>({});
  /** project id → the answer to "which gate is this stage?" (NOT_A_GATE = none). */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState<Record<string, boolean>>({});

  async function read(f: File | undefined) {
    if (!f || !week) return;
    setReading(f.name);
    setError(null);
    setFileError(null);
    const fd = new FormData();
    fd.append("file", f);
    fd.append("week", week);
    const res = await fetch("/api/reports/status-upload", { method: "POST", body: fd });
    const body = await res.json().catch(() => null);
    setReading(null);
    if (fileInput.current) fileInput.current.value = "";
    if (!res.ok) {
      setFileError(readApiError(body, "The file could not be read. Choose a Word, Excel, PDF or PowerPoint report.").message);
      return;
    }
    const p = body.data as Preview;
    setPreview(p);
    setPlaced(Object.fromEntries(p.rows.map((r) => [r.line, r.match.projectId && r.match.confidence === "exact" && projects.some((x) => x.catalog.projectId === r.match.projectId) ? r.match.projectId : ""])));
    setAnswers({});
    setRemember({});
  }

  const projectOf = (id: string) => projects.find((x) => x.catalog.projectId === id) ?? null;
  /** The market a placed row lands on: the reader's match, or the row's market named on that project. */
  const marketFor = (row: PreviewRow, project: WorkspaceProject): CatalogMarket | null => {
    if (row.match.projectId === project.catalog.projectId && row.match.orgUnitId) return project.catalog.markets.find((m) => m.orgUnitId === row.match.orgUnitId) ?? null;
    if (!row.market) return null;
    const want = row.market.toLowerCase();
    return project.catalog.markets.find((m) => m.code.toLowerCase() === want || m.name.toLowerCase() === want) ?? null;
  };

  const rows = preview?.rows ?? [];
  const placedRows = rows.filter((r) => placed[r.line] && placed[r.line] !== "skip" && projectOf(placed[r.line]!));
  const unplaced = rows.filter((r) => !placed[r.line]);
  // Stage questions: product-level lines whose stage QUBIT could not read as a gate.
  const questions = placedRows.flatMap((r) => {
    const project = projectOf(placed[r.line]!)!;
    if (!r.stage.trim() || marketFor(r, project)) return [];
    const reading = resolveDelivery(r, project.catalog, { market: null }).stage;
    if (!reading || reading.gateName || reading.clauses.length === 0 || project.catalog.gates.length === 0) return [];
    const known = project.catalog.stageTerms ?? [];
    return [{ row: r, project, clauses: reading.clauses.filter((cl) => !known.some((t) => t.term === fold(cl))) }];
  });
  const openQuestions = unplaced.length + questions.filter((q) => !answers[q.project.catalog.projectId]).length;

  function apply() {
    if (!preview) return;
    if (placedRows.length === 0) {
      setPlaceError("Place at least one line on a project, or choose a different file.");
      return;
    }
    setPlaceError(null);
    onApply({
      preview,
      attach,
      placements: placedRows.map((row) => {
        const project = projectOf(placed[row.line]!)!;
        return { row, projectId: project.catalog.projectId, orgUnitId: marketFor(row, project)?.orgUnitId ?? null };
      }),
      answers: questions.flatMap((q) => {
        const a = answers[q.project.catalog.projectId];
        if (!a) return [];
        const gateName = a === NOT_A_GATE ? null : a;
        return [{ projectId: q.project.catalog.projectId, gateName, remember: gateName ? q.clauses.filter((cl) => remember[`${q.project.catalog.projectId}:${cl}`]) : [] }];
      }),
    });
  }

  async function create(row: PreviewRow) {
    setCreating(row.line);
    setError(null);
    const out = await onCreateProject(row.project);
    setCreating(null);
    if ("id" in out) setPlaced((p) => ({ ...p, [row.line]: out.id }));
    else setError(out.error);
  }

  const input = <input ref={fileInput} type="file" accept=".docx,.xlsx,.pptx,.pdf" className="sr-only" aria-label="Status report file" onChange={(e) => void read(e.target.files?.[0])} />;

  if (!preview) {
    return (
      <DrawerFrame
        header={<DrawerHeader step="Status Report" title="Upload a Status Report" subtitle={weekLabel} />}
        footer={
          <DrawerFooter>
            <button type="button" onClick={onClose} className={SECONDARY}>
              Cancel
            </button>
          </DrawerFooter>
        }
      >
        {error && <Banner tone="bad">{error}</Banner>}
        <DrawerText>QUBIT reads each line of the week&apos;s report into your cards: the gates per market, channel states, market check-ins and the line for the Head. It asks when a phrase is unclear.</DrawerText>
        {input}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={reading !== null || !week}
          id="status-file"
          data-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? "status-file-error" : undefined}
          className={cn("flex flex-col items-center gap-2 rounded-[var(--ds-radius-kv)] border border-dashed border-[var(--ds-line)] bg-[var(--ds-surface2)] px-4 py-8 text-center transition-colors hover:border-[var(--ds-brand)] data-[invalid=true]:border-[var(--ds-bad)] disabled:cursor-not-allowed disabled:opacity-60", FOCUS)}
        >
          {reading ? <Loader2 className="size-5 animate-spin text-[var(--ds-ink3)]" aria-hidden /> : <Upload className="size-5 text-[var(--ds-ink3)]" aria-hidden />}
          <span className="text-[13px] font-semibold text-[var(--ds-ink)]">{reading ? `Reading ${reading}…` : "Choose a File"}</span>
          <span className="text-[12px] text-[var(--ds-ink3)]">Word, Excel or PDF table, the milestone tracker, or a PowerPoint one-pager per project or market</span>
        </button>
        {fileError && <FieldError id="status-file-error">{fileError}</FieldError>}
        <DrawerText hint>Nothing is saved until you save or send a card. Lines reach the Head only when you confirm them.</DrawerText>
      </DrawerFrame>
    );
  }

  return (
    <DrawerFrame
      header={<DrawerHeader step="Status Report" title={preview.fileName} subtitle={`${rows.length} ${rows.length === 1 ? "line" : "lines"} read · ${openQuestions === 0 ? "nothing needs your answer" : `${openQuestions} ${openQuestions === 1 ? "needs" : "need"} your answer`}`} />}
      footer={
        <DrawerFooter note={`${placedRows.length} of ${rows.length} placed`}>
          <button type="button" onClick={onClose} className={SECONDARY}>
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={creating !== null} className={PRIMARY}>
            Apply to Update
          </button>
        </DrawerFooter>
      }
    >
      {error && <Banner tone="bad">{error}</Banner>}
      {(preview.preparedBy || preview.reportDate) && (
        <Kv
          rows={[
            ...(preview.preparedBy ? ([["Prepared by", preview.preparedBy]] as [string, string][]) : []),
            ...(preview.reportDate ? ([["Report date", preview.reportDate]] as [string, string][]) : []),
          ]}
        />
      )}
      {preview.warnings.length > 0 && <Banner tone="warn">{preview.warnings.join(" · ")}</Banner>}

      <DrawerSection title="What QUBIT Read">
        {placedRows.length === 0 ? (
          <>
            <DrawerText hint>No line is placed on a project yet. Answer the questions below.</DrawerText>
            {placeError && <FieldError id="status-place-error">{placeError}</FieldError>}
          </>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {placedRows.map((r) => {
              const project = projectOf(placed[r.line]!)!;
              const market = marketFor(r, project);
              const plan = resolveDelivery(r, project.catalog, { market });
              const gates = plan.gates.filter((g) => !g.backwards);
              return (
                <li key={r.line} className="flex flex-col gap-1.5 border-b border-dotted border-[var(--ds-line)] py-2.5 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <b className="block text-[13px] font-semibold text-[var(--ds-ink)]">“{r.update || r.stage || r.project}”</b>
                      <span className="text-[12px] text-[var(--ds-ink3)]">
                        {project.catalog.name}
                        {market ? ` · ${market.name}` : ""}
                        {r.stage && r.update ? ` · stage “${r.stage}”` : ""}
                      </span>
                    </div>
                    {r.status && <HealthPill value={r.status} className="flex-none" />}
                  </div>
                  {(gates.length > 0 || plan.modules.length > 0 || plan.unmatched.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {gates.slice(0, 5).map((g) => (
                        <Chip key={g.checkpointId} tone={GATE_TONE[g.to]}>
                          {g.name} · {GATE_STATE_LABEL[g.to].toLowerCase()}
                        </Chip>
                      ))}
                      {gates.length > 5 && <Chip>+{gates.length - 5} more gates</Chip>}
                      {plan.modules.filter((m) => !m.backwards).length > 0 && <Chip tone="info">{plan.modules.filter((m) => !m.backwards).length} channel states</Chip>}
                      {plan.unmatched.length > 0 && <Chip tone="warn">{plan.unmatched.length} not placed</Chip>}
                    </div>
                  )}
                  {r.warnings.length > 0 && <span className="text-[12px] text-[var(--ds-warn-text)]">{r.warnings.join(" · ")}</span>}
                  <TextButton onClick={() => setPlaced((p) => ({ ...p, [r.line]: "skip" }))} className="self-start text-[var(--ds-ink3)]">
                    Leave this line out
                  </TextButton>
                </li>
              );
            })}
          </ul>
        )}
      </DrawerSection>

      {openQuestions > 0 || questions.length > 0 ? (
        <DrawerSection title={unplaced.length + questions.length === 1 ? "One Question" : `${unplaced.length + questions.length} Questions`}>
          <div className="flex flex-col gap-4">
            {unplaced.map((r) => {
              const suggested = r.match.confidence === "suggested" && r.match.projectId ? projectOf(r.match.projectId) : null;
              return (
                <div key={r.line} className="flex flex-col gap-2">
                  <DrawerText>
                    <b className="text-[var(--ds-ink)]">“{r.project}”</b>: which project is this?
                    {r.status && (
                      <>
                        {" "}
                        <HealthPill value={r.status} />
                      </>
                    )}
                  </DrawerText>
                  <select defaultValue="" onChange={(e) => e.target.value && setPlaced((p) => ({ ...p, [r.line]: e.target.value }))} aria-label={`Project for ${r.project}`} className={FIELD_INPUT}>
                    <option value="">{suggested ? `Suggested: ${suggested.catalog.name}` : "Pick the project"}</option>
                    {projects.map((p) => (
                      <option key={p.catalog.projectId} value={p.catalog.projectId}>
                        {p.catalog.code} · {p.catalog.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {suggested && <TextButton onClick={() => setPlaced((p) => ({ ...p, [r.line]: suggested.catalog.projectId }))}>Yes, {suggested.catalog.name}</TextButton>}
                    <TextButton onClick={() => void create(r)}>{creating === r.line ? "Creating…" : "Create It as a New Project"}</TextButton>
                    <TextButton onClick={() => setPlaced((p) => ({ ...p, [r.line]: "skip" }))} className="text-[var(--ds-ink3)]">
                      Skip
                    </TextButton>
                  </div>
                </div>
              );
            })}
            {questions.map((q) => {
              const pid = q.project.catalog.projectId;
              const a = answers[pid] ?? null;
              return (
                <div key={`${pid}:${q.row.line}`} className="flex flex-col gap-2">
                  <DrawerText>
                    <b className="text-[var(--ds-ink)]">“{q.row.stage}”</b>: which gate is this? <span className="text-[var(--ds-ink3)]">({q.project.catalog.name})</span>
                  </DrawerText>
                  <Choice
                    label={`Gate for “${q.row.stage}”`}
                    value={a}
                    options={[...q.project.catalog.gates.map((g) => ({ value: g.name, label: g.name })), { value: NOT_A_GATE, label: "Not a gate" }]}
                    onChange={(v) => setAnswers((x) => ({ ...x, [pid]: v }))}
                  />
                  {a && a !== NOT_A_GATE && q.clauses.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                      {q.clauses.map((cl) => {
                        const k = `${pid}:${cl}`;
                        return (
                          <li key={k}>
                            <label className="flex items-center gap-2 text-[13px] text-[var(--ds-ink)]">
                              <input type="checkbox" checked={Boolean(remember[k])} onChange={(e) => setRemember((x) => ({ ...x, [k]: e.target.checked }))} className="size-4 accent-[var(--ds-brand)]" />
                              {q.clauses.length === 1 ? "Remember this phrase" : `Remember “${cl}”`} for {tenantName || "everyone"}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </DrawerSection>
      ) : null}

      <label className="flex items-center gap-2 text-[13px] text-[var(--ds-ink)]">
        <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="size-4 accent-[var(--ds-brand)]" />
        Attach the file to each project&apos;s Documents when you save
      </label>
      {input}
      <TextButton onClick={() => fileInput.current?.click()} className="self-start">
        {reading ? `Reading ${reading}…` : "Choose a Different File"}
      </TextButton>
      {fileError && <FieldError id="status-file-error">{fileError}</FieldError>}
    </DrawerFrame>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FIELD_INPUT, FIELD_TEXTAREA } from "@/components/ui/drawer";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { MergeIdeaFormSchema, NewIdeaFormSchema, ParkIdeaFormSchema } from "@/lib/idea-schema";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { matchesSearch, paginate } from "@/lib/list-state";
import { matchesSubmitted, SUBMITTED_BUCKETS, SUBMITTED_LABEL } from "@/lib/list-buckets";
import { formatDate } from "@/lib/dates";
import { THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * M-P4a (docs/35 §1) — idea intake & triage. "Accept" routes to the project wizard
 * pre-filled (?fromIdea=) — nothing is retyped between intake and delivery; "Park" needs a
 * reason; "Merge" folds the idea into a live project.
 *
 * UX5 (L1–L5): the submit form moves behind "+ New idea" (the header's primary action) and
 * the New / Reviewing lanes plus the Decided list become one table — search, Sponsor ·
 * Stage · Submitted filters, always-visible pagination, all view state in the URL. The
 * Head sees every idea; anyone else sees the ones they submitted (getIdeaBoard decides).
 */

type IdeaStatus = "New" | "Reviewing" | "Accepted" | "Parked" | "Merged";
interface IdeaRow {
  id: string;
  title: string;
  sponsor: string;
  problem: string;
  expectedValue: string | null;
  status: IdeaStatus;
  parkReason: string | null;
  summary: string | null;
  suggestedPortfolio: { id: string; name: string } | null;
  submittedByName: string | null;
  submittedAt: string;
  triagedByName: string | null;
  triagedAt: string | null;
  outcomeProject: { id: string; code: string; name: string } | null;
  mine: boolean;
}
interface Board {
  canTriage: boolean;
  lanes: { key: "New" | "Reviewing"; ideas: IdeaRow[] }[];
  decided: IdeaRow[];
}

const STATUS_ORDER: IdeaStatus[] = ["New", "Reviewing", "Accepted", "Parked", "Merged"];
// Open ideas sit in the Intake stage: New in the intake grey, Reviewing in the exploring
// blue; Accepted takes the approved teal. Parked and Merged are closed, so they stay neutral.
const STATUS_TOKEN: Record<IdeaStatus, string> = {
  New: "--stage-intake",
  Reviewing: "--stage-exploring",
  Accepted: "--stage-approved",
  Parked: "--ink3",
  Merged: "--ink3",
};

const FILTER_KEYS = ["sponsor", "stage", "submitted"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABEL: Record<FilterKey, string> = { sponsor: "Sponsor", stage: "Stage", submitted: "Submitted" };


function StatusPill({ status }: { status: IdeaStatus }) {
  const tok = STATUS_TOKEN[status];
  return (
    <span
      className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full px-2 text-[12px] font-semibold"
      style={{ color: `var(${tok})`, background: `color-mix(in oklab, var(${tok}) 12%, transparent)` }}
    >
      {status}
    </span>
  );
}

export function IdeasClient({
  initial,
  portfolios,
  projects,
  tenantName,
  timeZone,
}: {
  initial: Board;
  portfolios: { id: string; name: string }[];
  projects: { id: string; code: string; name: string }[];
  tenantName: string;
  timeZone: string;
}) {
  const router = useRouter();
  const list = useListUrl("ideas", 10);
  const [board, setBoard] = useState<Board>(initial);
  // The top bar's "+ New › Idea" lands here with ?new=1 (UX fidelity F1).
  const searchParams = useSearchParams();
  const [newOpen, setNewOpen] = useState(searchParams.get("new") === "1");
  const [pending, setPending] = useState<{ mode: "park" | "merge"; idea: IdeaRow } | null>(null);
  const row = useAdminMutation();

  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, list.get(k)])) as Record<FilterKey, string>;

  async function reload() {
    const res = await fetch("/api/ideas");
    if (res.ok) setBoard(((await res.json()) as { data: Board }).data);
  }

  // Row actions surface failures as a toast — the table card holds only the table.
  useEffect(() => {
    if (row.error) toast.error(row.error);
  }, [row.error]);

  async function review(id: string, reviewing: boolean) {
    const ok = await row.mutate(`/api/ideas/${id}/triage`, "POST", { action: "review", reviewing }, { fallback: "Triage failed.", refresh: false });
    if (ok) await reload();
  }

  const ideas = useMemo(() => [...board.lanes.flatMap((l) => l.ideas), ...board.decided], [board]);

  const opts = useMemo<Record<FilterKey, FilterOption[]>>(
    () => ({
      sponsor: [...new Set(ideas.map((i) => i.sponsor))].sort((a, b) => a.localeCompare(b)).map((s) => ({ value: s, label: s })),
      stage: STATUS_ORDER.map((s) => ({ value: s, label: s })),
      submitted: SUBMITTED_BUCKETS.map((b) => ({ value: b, label: SUBMITTED_LABEL[b] })),
    }),
    [ideas],
  );

  const filtered = useMemo(
    () =>
      ideas
        .filter(
          (i) =>
            matchesSearch(list.q, i.title, i.sponsor, i.problem) &&
            (!f.sponsor || i.sponsor === f.sponsor) &&
            (!f.stage || i.status === f.stage) &&
            matchesSubmitted(f.submitted, i.submittedAt),
        )
        // Waiting for triage first, then decided; newest first within each.
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.submittedAt.localeCompare(a.submittedAt)),
    [ideas, list.q, f.sponsor, f.stage, f.submitted],
  );
  const { rows, info } = paginate(filtered, list.page, list.size);

  const active: ActiveFilter[] = FILTER_KEYS.filter((k) => f[k]).map((k) => ({
    key: k,
    label: `${FILTER_LABEL[k]}: ${opts[k].find((o) => o.value === f[k])?.label ?? f[k]}`,
  }));
  const isFiltered = active.length > 0 || !!list.q;

  return (
    <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 p-[22px_24px_90px]">
      <PageHeader
        eyebrow={board.canTriage ? "Ideas" : tenantName}
        title={board.canTriage ? "Triage Board" : "Ideas"}
        description={
          board.canTriage
            ? "Where projects are born. Accept an idea and the project wizard opens pre-filled; park it and the reason stays on the record."
            : "Submit an idea — anyone can. The Head triages it, and you'll be told what was decided and why."
        }
        actions={
          <Button type="button" onClick={() => setNewOpen(true)}>
            <Plus /> New Idea
          </Button>
        }
      />

      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search ideas or sponsors" label="Search ideas" />
          <FilterSelect label="Sponsor" allLabel="All sponsors" value={f.sponsor} options={opts.sponsor} onChange={(v) => list.set({ sponsor: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Submitted" allLabel="Any time" value={f.submitted} options={opts.submitted} onChange={(v) => list.set({ submitted: v })} />
          <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
        </ListToolbar>
      </div>

      <TableCard footer={<TableFooter info={info} noun="ideas" onPage={list.setPage} onSize={list.setSize} />}>
        {rows.length === 0 ? (
          <ListEmpty
            filtered={isFiltered}
            noun="ideas"
            onClear={() => list.clear([...FILTER_KEYS])}
            hint={!isFiltered && !board.canTriage ? "Ideas you submit appear here, with what was decided and why." : undefined}
            action={
              // The header keeps the page's one filled primary; this repeat is outlined.
              <Button type="button" variant="outline" onClick={() => setNewOpen(true)}>
                <Plus /> New Idea
              </Button>
            }
          />
        ) : (
          <table className="relative w-full min-w-[920px] border-separate border-spacing-0 text-left text-[12.5px]">
            <thead className={THEAD}>
              <tr>
                <th scope="col">Idea</th>
                <th scope="col">Sponsor</th>
                <th scope="col">Stage</th>
                <th scope="col">Submitted</th>
                <th scope="col">Outcome</th>
                {board.canTriage && (
                  <th scope="col" className="text-right">
                    <span className="sr-only">Triage</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((idea) => {
                const open = idea.status === "New" || idea.status === "Reviewing";
                return (
                  <tr key={idea.id} className={cn(TROW, "align-top transition-colors hover:[&>td]:bg-[var(--ds-surface2)] [&>td]:align-top")}>
                    <td className="max-w-[420px]">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 font-semibold text-[var(--ds-ink)]">{idea.title}</span>
                        {idea.mine && <span className="flex-none text-[11px] font-semibold text-[var(--ds-ink3)]">Yours</span>}
                      </span>
                      <span className="line-clamp-2 text-[12px] text-[var(--ds-ink3)]" title={idea.expectedValue ? `${idea.problem}\nValue: ${idea.expectedValue}` : idea.problem}>
                        {idea.problem}
                      </span>
                      {idea.suggestedPortfolio && <span className="block truncate text-[12px] text-[var(--ds-ink3)]">Suggested portfolio: {idea.suggestedPortfolio.name}</span>}
                      {/* An empty summary says "not summarised" — never a fabricated line (docs/35 §3). */}
                      {idea.summary && <span className="block text-[12px] italic text-[var(--ds-ink3)]">{idea.summary}</span>}
                    </td>
                    <td className="text-[var(--ds-ink2)]">{idea.sponsor}</td>
                    <td>
                      <StatusPill status={idea.status} />
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="block tabular-nums text-[var(--ds-ink2)]">{formatDate(idea.submittedAt, timeZone)}</span>
                      {idea.submittedByName && <span className="block text-[12px] text-[var(--ds-ink3)]">by {idea.submittedByName}</span>}
                    </td>
                    <td className="max-w-[260px] text-[12.5px]">
                      {idea.outcomeProject ? (
                        <Link href={`/projects/${idea.outcomeProject.id}`} className="font-semibold text-[var(--ds-ink)] hover:underline" title={idea.outcomeProject.name}>
                          {idea.outcomeProject.code} · <span className="font-normal text-[var(--ds-ink2)]">{idea.outcomeProject.name}</span>
                        </Link>
                      ) : idea.parkReason ? (
                        <span className="line-clamp-2 italic text-[var(--ds-ink3)]" title={idea.parkReason}>
                          “{idea.parkReason}”
                        </span>
                      ) : (
                        <span className="text-[var(--ds-ink3)]">{idea.status === "Reviewing" ? "Under review" : open ? "Waiting for triage" : "—"}</span>
                      )}
                    </td>
                    {board.canTriage && (
                      <td className="whitespace-nowrap text-right">
                        {open && (
                          <span className="inline-flex items-center gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={row.busy} onClick={() => router.push(`/projects/new?fromIdea=${idea.id}`)}>
                              Accept
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger render={<Button type="button" size="icon-sm" variant="outline" disabled={row.busy} aria-label={`More triage actions for ${idea.title}`} />}>
                                <MoreHorizontal />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => void review(idea.id, idea.status === "New")}>
                                  {idea.status === "New" ? "Mark as reviewing" : "Back to New"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPending({ mode: "park", idea })}>Park…</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setPending({ mode: "merge", idea })}>Merge into a project…</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      <NewIdeaDialog open={newOpen} onOpenChange={setNewOpen} portfolios={portfolios} onSubmitted={reload} />
      {board.canTriage && <TriageDialog pending={pending} onClose={() => setPending(null)} projects={projects} onDone={reload} />}
    </main>
  );
}

export function NewIdeaDialog({
  open,
  onOpenChange,
  portfolios,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolios: { id: string; name: string }[];
  onSubmitted: () => Promise<void>;
}) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [title, setTitle] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [problem, setProblem] = useState("");
  const [value, setValue] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  // docs/08 § Errors: Title, Sponsor and Problem show their problems on the field.
  const fe = useFieldErrors({ schema: NewIdeaFormSchema, values: { title, sponsor, problem, expectedValue: value }, idPrefix: "idea" });

  // Fresh form on every open so a second idea doesn't inherit the last attempt.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSponsor("");
    setProblem("");
    setValue("");
    setPortfolioId("");
    setError(null);
    fe.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open, setError]);

  async function submit() {
    setError(null);
    if (!fe.validate()) return;
    const ok = await mutate(
      "/api/ideas",
      "POST",
      { title, sponsor, problem, expectedValue: value.trim() || null, suggestedPortfolioId: portfolioId || null },
      {
        fallback: "Could not submit the idea.",
        refresh: false,
        onFieldErrors: (fields) => fe.setServerErrors(fields, ["title", "sponsor", "problem", "expectedValue", "suggestedPortfolioId"]),
      },
    );
    if (ok) {
      onOpenChange(false);
      toast.success("Idea submitted — the Head has been notified.");
      await onSubmitted();
    }
  }

  return (
    <AdminFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Idea"
      description="Anyone can submit one. The Head triages it and you'll be told what was decided."
      error={error}
      busy={busy}
      submitLabel="Submit Idea"
      busyLabel="Submitting…"
      onSubmit={submit}
      className="sm:max-w-[520px]"
    >
      <Field label="Title" htmlFor={fe.idOf("title")} error={fe.errors.title}>
        <Input {...fe.bind("title")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Instant merchant settlement" />
      </Field>
      <Field label="Sponsor" htmlFor={fe.idOf("sponsor")} error={fe.errors.sponsor}>
        <Input {...fe.bind("sponsor")} value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="For example: Head of Merchant Banking" />
      </Field>
      <Field label="Problem It Solves" htmlFor={fe.idOf("problem")} error={fe.errors.problem}>
        <textarea
          {...fe.bind("problem")}
          rows={4}
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="For example: Merchants wait T+1 for settlement; competitors offer instant."
          className={FIELD_TEXTAREA}
        />
      </Field>
      <Field label="Expected Value (Optional)" htmlFor={fe.idOf("expectedValue")} error={fe.errors.expectedValue}>
        <Input {...fe.bind("expectedValue")} value={value} onChange={(e) => setValue(e.target.value)} placeholder="For example: Retain 200+ merchants; fee upside" />
      </Field>
      <Field label="Portfolio It Might Belong To" htmlFor={fe.idOf("suggestedPortfolioId")} error={fe.errors.suggestedPortfolioId} hint="Your suggestion, not a decision — triage confirms it.">
        <select {...fe.bind("suggestedPortfolioId")} value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className={FIELD_INPUT}>
          <option value="">No suggestion</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
    </AdminFormDialog>
  );
}

/** Head-only: park (with the required reason) or merge into a live project. */
function TriageDialog({
  pending,
  onClose,
  projects,
  onDone,
}: {
  pending: { mode: "park" | "merge"; idea: IdeaRow } | null;
  onClose: () => void;
  projects: { id: string; code: string; name: string }[];
  onDone: () => Promise<void>;
}) {
  const { busy, error, setError, mutate } = useAdminMutation();
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const parkFe = useFieldErrors({ schema: ParkIdeaFormSchema, values: { reason }, idPrefix: "park" });
  const mergeFe = useFieldErrors({ schema: MergeIdeaFormSchema, values: { projectId: target }, idPrefix: "merge" });

  useEffect(() => {
    if (!pending) return;
    setReason("");
    setTarget("");
    setError(null);
    parkFe.reset();
    mergeFe.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a new idea is opened
  }, [pending, setError]);

  if (!pending) return null;
  const park = pending.mode === "park";

  async function submit() {
    if (!pending) return;
    setError(null);
    if (!(park ? parkFe : mergeFe).validate()) return;
    const ok = await mutate(
      `/api/ideas/${pending.idea.id}/triage`,
      "POST",
      park ? { action: "park", reason } : { action: "merge", projectId: target },
      {
        fallback: "Could not save the decision.",
        refresh: false,
        onFieldErrors: (fields) => (park ? parkFe : mergeFe).setServerErrors(fields),
      },
    );
    if (ok) {
      onClose();
      await onDone();
    }
  }

  return (
    <AdminFormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={park ? "Park This Idea" : "Merge Into a Project"}
      description={pending.idea.title}
      error={error}
      busy={busy}
      submitLabel={park ? "Park Idea" : "Merge Into This Project"}
      busyLabel={park ? "Parking…" : "Merging…"}
      onSubmit={submit}
    >
      {park ? (
        <Field label="Why Is It Parked?" htmlFor={parkFe.idOf("reason")} error={parkFe.errors.reason} hint="The submitter is told why. At least 5 characters.">
          <textarea
            {...parkFe.bind("reason")}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: Good idea, wrong quarter — revisit after the FAL migration."
            className={FIELD_TEXTAREA}
          />
        </Field>
      ) : (
        <Field label="Fold Into Which Project?" htmlFor={mergeFe.idOf("projectId")} error={mergeFe.errors.projectId}>
          <select {...mergeFe.bind("projectId")} value={target} onChange={(e) => setTarget(e.target.value)} className={FIELD_INPUT}>
            <option value="">Choose a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </AdminFormDialog>
  );
}

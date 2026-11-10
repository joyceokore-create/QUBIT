"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminFormDialog } from "@/components/admin/admin-form-dialog";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/list/page-header";
import { FilterChips, FilterSelect, ListToolbar, SearchField, type ActiveFilter, type FilterOption } from "@/components/list/list-toolbar";
import { ListEmpty, TableCard, TableFooter } from "@/components/list/table-footer";
import { useListUrl } from "@/components/list/use-list-url";
import { matchesSearch, paginate } from "@/lib/list-state";
import { matchesSubmitted, SUBMITTED_BUCKETS, SUBMITTED_LABEL } from "@/lib/list-buckets";
import { formatDate } from "@/lib/dates";

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

const FIELD_LABEL = "text-sm font-medium text-ink-2";
const TEXTAREA = "w-full rounded-lg border border-input bg-background p-2.5 text-sm placeholder:text-muted-foreground";
const SELECT = "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

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
  const [newOpen, setNewOpen] = useState(false);
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
        eyebrow={tenantName}
        title="Ideas"
        description={
          board.canTriage
            ? "Where projects are born. Accept an idea and the project wizard opens pre-filled; park it and the reason stays on the record."
            : "Submit an idea — anyone can. The Head triages it, and you'll be told what was decided and why."
        }
        actions={
          <Button type="button" onClick={() => setNewOpen(true)}>
            <Plus /> New idea
          </Button>
        }
      />

      <div className="flex flex-col gap-2">
        <ListToolbar>
          <SearchField value={list.q} onChange={(q) => list.set({ q })} placeholder="Search ideas or sponsors" label="Search ideas" />
          <FilterSelect label="Sponsor" allLabel="All sponsors" value={f.sponsor} options={opts.sponsor} onChange={(v) => list.set({ sponsor: v })} />
          <FilterSelect label="Stage" allLabel="All stages" value={f.stage} options={opts.stage} onChange={(v) => list.set({ stage: v })} />
          <FilterSelect label="Submitted" allLabel="Any time" value={f.submitted} options={opts.submitted} onChange={(v) => list.set({ submitted: v })} />
        </ListToolbar>
        <FilterChips filters={active} onRemove={(k) => list.set({ [k]: null })} onClearAll={() => list.clear([...FILTER_KEYS])} />
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
                <Plus /> New idea
              </Button>
            }
          />
        ) : (
          <table className="relative w-full min-w-[920px] text-left text-[13px]">
            <thead className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">Idea</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Sponsor</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Stage</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Submitted</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Outcome</th>
                {board.canTriage && (
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    <span className="sr-only">Triage</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((idea) => {
                const open = idea.status === "New" || idea.status === "Reviewing";
                return (
                  <tr key={idea.id} className="border-b border-[var(--border)] align-top transition-colors last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="max-w-[420px] px-4 py-2.5">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 font-semibold text-[var(--qink)]">{idea.title}</span>
                        {idea.mine && <span className="flex-none text-[11px] font-semibold text-[var(--ink3)]">Yours</span>}
                      </span>
                      <span className="line-clamp-2 text-[12px] text-[var(--ink3)]" title={idea.expectedValue ? `${idea.problem}\nValue: ${idea.expectedValue}` : idea.problem}>
                        {idea.problem}
                      </span>
                      {idea.suggestedPortfolio && <span className="block truncate text-[12px] text-[var(--ink3)]">Suggested portfolio: {idea.suggestedPortfolio.name}</span>}
                      {/* An empty summary says "not summarised" — never a fabricated line (docs/35 §3). */}
                      {idea.summary && <span className="block text-[12px] italic text-[var(--ink3)]">{idea.summary}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--ink2)]">{idea.sponsor}</td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={idea.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="block tabular-nums text-[var(--ink2)]">{formatDate(idea.submittedAt, timeZone)}</span>
                      {idea.submittedByName && <span className="block text-[12px] text-[var(--ink3)]">by {idea.submittedByName}</span>}
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5 text-[12.5px]">
                      {idea.outcomeProject ? (
                        <Link href={`/projects/${idea.outcomeProject.id}`} className="font-semibold text-[var(--qink)] hover:underline" title={idea.outcomeProject.name}>
                          {idea.outcomeProject.code} · <span className="font-normal text-[var(--ink2)]">{idea.outcomeProject.name}</span>
                        </Link>
                      ) : idea.parkReason ? (
                        <span className="line-clamp-2 italic text-[var(--ink3)]" title={idea.parkReason}>
                          “{idea.parkReason}”
                        </span>
                      ) : (
                        <span className="text-[var(--ink3)]">{idea.status === "Reviewing" ? "Under review" : open ? "Waiting for triage" : "—"}</span>
                      )}
                    </td>
                    {board.canTriage && (
                      <td className="whitespace-nowrap px-3 py-2 text-right">
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

function NewIdeaDialog({
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

  // Fresh form on every open so a second idea doesn't inherit the last attempt.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSponsor("");
    setProblem("");
    setValue("");
    setPortfolioId("");
    setError(null);
  }, [open, setError]);

  async function submit() {
    const ok = await mutate(
      "/api/ideas",
      "POST",
      { title, sponsor, problem, expectedValue: value.trim() || null, suggestedPortfolioId: portfolioId || null },
      { fallback: "Could not submit the idea.", refresh: false },
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
      title="New idea"
      description="Anyone can submit one. The Head triages it and you'll be told what was decided."
      error={error}
      busy={busy}
      submitLabel="Submit idea"
      busyLabel="Submitting…"
      onSubmit={submit}
      className="sm:max-w-[520px]"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-title" className={FIELD_LABEL}>Title</label>
        <Input id="idea-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Instant merchant settlement" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-sponsor" className={FIELD_LABEL}>Sponsor</label>
        <Input id="idea-sponsor" value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="For example: Head of Merchant Banking" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-problem" className={FIELD_LABEL}>Problem it solves</label>
        <textarea
          id="idea-problem"
          rows={4}
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="For example: Merchants wait T+1 for settlement; competitors offer instant."
          className={TEXTAREA}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-value" className={FIELD_LABEL}>
          Expected value <span className="font-normal text-[var(--ink4)]">(optional)</span>
        </label>
        <Input id="idea-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="For example: Retain 200+ merchants; fee upside" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="idea-portfolio" className={FIELD_LABEL}>Portfolio it might belong to</label>
        <select id="idea-portfolio" value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className={SELECT}>
          <option value="">No suggestion</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-[12px] text-[var(--ink3)]">Your suggestion, not a decision — triage confirms it.</p>
      </div>
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

  useEffect(() => {
    if (!pending) return;
    setReason("");
    setTarget("");
    setError(null);
  }, [pending, setError]);

  if (!pending) return null;
  const park = pending.mode === "park";

  async function submit() {
    if (!pending) return;
    if (park && reason.trim().length < 5) {
      setError("Say why it is being parked — the reason is the record.");
      return;
    }
    if (!park && !target) {
      setError("Choose the project to merge into.");
      return;
    }
    const ok = await mutate(
      `/api/ideas/${pending.idea.id}/triage`,
      "POST",
      park ? { action: "park", reason } : { action: "merge", projectId: target },
      { fallback: "Triage failed.", refresh: false },
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
      title={park ? "Park this idea" : "Merge into a project"}
      description={pending.idea.title}
      error={error}
      busy={busy}
      submitLabel={park ? "Park with this reason" : "Merge into this project"}
      busyLabel={park ? "Parking…" : "Merging…"}
      onSubmit={submit}
    >
      {park ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="park-reason" className={FIELD_LABEL}>Why is it parked?</label>
          <textarea
            id="park-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: Good idea, wrong quarter — revisit after the FAL migration."
            className={TEXTAREA}
          />
          <p className="text-[12px] text-[var(--ink3)]">The submitter is told why. At least 5 characters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="merge-target" className={FIELD_LABEL}>Fold into which project?</label>
          <select id="merge-target" value={target} onChange={(e) => setTarget(e.target.value)} className={SELECT}>
            <option value="">Choose a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </AdminFormDialog>
  );
}

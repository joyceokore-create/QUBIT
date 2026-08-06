"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CARD } from "@/lib/surface";

/**
 * M-P4a (docs/35 §1) — idea intake & triage, laid out as the wizards wireframe draws it:
 * submit form on the left, the two-lane triage board on the right, the three actions
 * under it. "Accept" routes to the project wizard pre-filled (?fromIdea=) — nothing is
 * retyped between intake and delivery.
 */

interface IdeaRow {
  id: string;
  title: string;
  sponsor: string;
  problem: string;
  expectedValue: string | null;
  status: "New" | "Reviewing" | "Accepted" | "Parked" | "Merged";
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

const LABEL = "text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase";
const TEXTAREA = "mt-1.5 w-full rounded-lg border border-input bg-background p-2.5 text-sm";
const SELECT = "mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

const STATUS_TOK: Record<string, string> = {
  New: "--qinfo",
  Reviewing: "--warn",
  Accepted: "--ok",
  Parked: "--ink4",
  Merged: "--ink4",
};

export function IdeasClient({
  initial,
  portfolios,
  projects,
}: {
  initial: Board;
  portfolios: { id: string; name: string }[];
  projects: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const { busy, error, setError, mutate } = useAdminMutation();
  const [board, setBoard] = useState<Board>(initial);

  const [title, setTitle] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [problem, setProblem] = useState("");
  const [value, setValue] = useState("");
  const [portfolioId, setPortfolioId] = useState("");
  const [sent, setSent] = useState(false);

  async function reload() {
    const res = await fetch("/api/ideas");
    if (res.ok) setBoard(((await res.json()) as { data: Board }).data);
  }

  async function submit() {
    setSent(false);
    const ok = await mutate(
      "/api/ideas",
      "POST",
      {
        title,
        sponsor,
        problem,
        expectedValue: value.trim() || null,
        suggestedPortfolioId: portfolioId || null,
      },
      { fallback: "Could not submit the idea." },
    );
    if (ok) {
      setTitle("");
      setSponsor("");
      setProblem("");
      setValue("");
      setPortfolioId("");
      setSent(true);
      await reload();
    }
  }

  async function triage(id: string, body: Record<string, unknown>) {
    const ok = await mutate(`/api/ideas/${id}/triage`, "POST", body, { fallback: "Triage failed." });
    if (ok) await reload();
  }

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      {/* ── Submit an idea ─────────────────────────────────────────────── */}
      <section className={`${CARD} p-4`} style={{ background: "var(--cardbg)" }}>
        <h2 className="mb-3 text-[14px] font-bold text-[var(--qink)]">Submit an idea</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="idea-title" className={LABEL}>Title</label>
            <Input
              id="idea-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Instant merchant settlement"
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="idea-sponsor" className={LABEL}>Sponsor</label>
            <Input
              id="idea-sponsor"
              value={sponsor}
              onChange={(e) => setSponsor(e.target.value)}
              placeholder="Head of Merchant Banking"
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="idea-problem" className={LABEL}>Problem it solves</label>
            <textarea
              id="idea-problem"
              rows={4}
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="Merchants wait T+1 for settlement; competitors offer instant."
              className={TEXTAREA}
            />
          </div>
          <div>
            <label htmlFor="idea-value" className={LABEL}>Expected value</label>
            <Input
              id="idea-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Retain 200+ merchants; fee upside"
              className="mt-1.5"
            />
          </div>
          <div>
            <label htmlFor="idea-portfolio" className={LABEL}>Portfolio it might belong to</label>
            <select
              id="idea-portfolio"
              value={portfolioId}
              onChange={(e) => setPortfolioId(e.target.value)}
              className={SELECT}
            >
              <option value="">No suggestion</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[10.5px] text-[var(--ink4)]">Your suggestion, not a decision — triage confirms it.</p>
          </div>
          {error && <p className="text-[11.5px] text-[var(--bad)]">{error}</p>}
          {sent && <p className="text-[11.5px] text-[var(--ok)]">Submitted — the Head of PMs has been notified.</p>}
          <div>
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              Submit idea
            </Button>
          </div>
        </div>
      </section>

      {/* ── Triage board ───────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-bold text-[var(--qink)]">
            {board.canTriage ? "Triage board" : "My ideas"}
          </h2>
          {board.canTriage && (
            <span
              className="rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
              style={{ color: "var(--qinfo)", background: "color-mix(in oklab, var(--qinfo) 12%, transparent)" }}
            >
              Head / PMO
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {board.lanes.map((lane) => (
            <div key={lane.key} className={`${CARD} flex flex-col p-3`} style={{ background: "var(--cardbg)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[1.2px] text-[var(--ink3)]">
                  {lane.key}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--ink4)]">{lane.ideas.length}</span>
              </div>
              {lane.ideas.length === 0 ? (
                <p className="text-[11.5px] text-[var(--ink5)]">
                  {lane.key === "New" ? "Nothing waiting — submit one on the left." : "Nothing under review."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {lane.ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      canTriage={board.canTriage}
                      projects={projects}
                      busy={busy}
                      onTriage={triage}
                      onAccept={() => router.push(`/projects/new?fromIdea=${idea.id}`)}
                      onError={setError}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={`${CARD} p-3`} style={{ background: "var(--cardbg)" }}>
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[1.2px] text-[var(--ink3)]">
            Decided
          </div>
          {board.decided.length === 0 ? (
            <p className="text-[11.5px] text-[var(--ink5)]">Nothing decided yet.</p>
          ) : (
            <div className="flex flex-col">
              {board.decided.map((idea) => (
                <div key={idea.id} className="flex flex-wrap items-baseline gap-2 border-b border-[var(--hair2)] py-2 last:border-0">
                  <span
                    className="flex-none rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.6px]"
                    style={{
                      color: `var(${STATUS_TOK[idea.status]})`,
                      background: `color-mix(in oklab, var(${STATUS_TOK[idea.status]}) 10%, transparent)`,
                    }}
                  >
                    {idea.status}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[var(--qink)]">{idea.title}</span>
                  {idea.outcomeProject && (
                    <Link
                      href={`/projects/${idea.outcomeProject.id}`}
                      className="flex-none font-mono text-[10px] uppercase text-[var(--ink4)] hover:text-[var(--qink)] hover:underline"
                    >
                      {idea.outcomeProject.code}
                    </Link>
                  )}
                  {idea.parkReason && (
                    <span className="w-full text-[11.5px] italic text-[var(--ink4)]">“{idea.parkReason}”</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function IdeaCard({
  idea,
  canTriage,
  projects,
  busy,
  onTriage,
  onAccept,
  onError,
}: {
  idea: IdeaRow;
  canTriage: boolean;
  projects: { id: string; code: string; name: string }[];
  busy: boolean;
  onTriage: (id: string, body: Record<string, unknown>) => Promise<void>;
  onAccept: () => void;
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState<"park" | "merge" | null>(null);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");

  return (
    <div className="rounded-[10px] border border-[var(--w07)] p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[var(--qink)]">{idea.title}</span>
        {idea.mine && (
          <span className="flex-none font-mono text-[8.5px] font-bold uppercase tracking-[.6px] text-[var(--ink5)]">
            yours
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[var(--ink4)]">
        {idea.sponsor}
        {idea.expectedValue && ` · value: ${idea.expectedValue}`}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-[1.45] text-[var(--ink3)]">{idea.problem}</p>
      {idea.suggestedPortfolio && (
        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[.8px] text-[var(--ink5)]">
          suggested: {idea.suggestedPortfolio.name}
        </p>
      )}
      {/* An empty summary says "not summarised" — never a fabricated line (docs/35 §3). */}
      {idea.summary && <p className="mt-1.5 text-[11.5px] italic text-[var(--ink3)]">{idea.summary}</p>}

      {canTriage && (
        <>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="rounded-[7px] bg-[var(--brand)] px-2.5 py-1 text-[11px] font-bold text-[var(--onbrand)] disabled:opacity-60"
            >
              Accept → new project
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onError(null);
                setOpen(open === "park" ? null : "park");
              }}
              className="rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] disabled:opacity-60"
            >
              Park
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onError(null);
                setOpen(open === "merge" ? null : "merge");
              }}
              className="rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] disabled:opacity-60"
            >
              Merge
            </button>
            {idea.status === "New" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onTriage(idea.id, { action: "review", reviewing: true })}
                className="rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] disabled:opacity-60"
              >
                Reviewing →
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onTriage(idea.id, { action: "review", reviewing: false })}
                className="rounded-[7px] border border-[var(--w07)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink3)] hover:text-[var(--qink)] disabled:opacity-60"
              >
                ← Back to New
              </button>
            )}
          </div>

          {open === "park" && (
            <div className="mt-2 flex flex-col gap-1.5">
              <label htmlFor={`park-${idea.id}`} className={LABEL}>Why is it parked?</label>
              <textarea
                id={`park-${idea.id}`}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Good idea, wrong quarter — revisit after the FAL migration."
                className="w-full rounded-lg border border-input bg-background p-2 text-[11.5px]"
              />
              <div>
                <button
                  type="button"
                  disabled={busy || reason.trim().length < 5}
                  onClick={() => void onTriage(idea.id, { action: "park", reason }).then(() => setOpen(null))}
                  className="rounded-[7px] bg-[var(--ink2)] px-2.5 py-1 text-[11px] font-bold text-[var(--cardbg)] disabled:opacity-50"
                >
                  Park with this reason
                </button>
              </div>
            </div>
          )}

          {open === "merge" && (
            <div className="mt-2 flex flex-col gap-1.5">
              <label htmlFor={`merge-${idea.id}`} className={LABEL}>Fold into which project?</label>
              <select
                id={`merge-${idea.id}`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-[12px]"
              >
                <option value="">Choose a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              <div>
                <button
                  type="button"
                  disabled={busy || !target}
                  onClick={() => void onTriage(idea.id, { action: "merge", projectId: target }).then(() => setOpen(null))}
                  className="rounded-[7px] bg-[var(--ink2)] px-2.5 py-1 text-[11px] font-bold text-[var(--cardbg)] disabled:opacity-50"
                >
                  Merge into this project
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!canTriage && idea.status === "Reviewing" && (
        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[.8px] text-[var(--ink5)]">under review</p>
      )}
    </div>
  );
}

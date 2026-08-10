"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Chip, OptionCard, WizardCard, WizardShell } from "@/components/wizard/wizard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assignmentWarnings } from "@/lib/capacity";
import { PROJECT_ROLES } from "@/lib/roles";
import { draftKey, nextStep, prevStep, type WizardStep } from "@/lib/wizard";

/**
 * Project wizard (docs/26 §5.3), decluttered DM1.73: Basics → Team → Review.
 * Basics absorbed Type & delivery and Markets (three related "where/what" choices, one
 * screen); Docs & requirements is gone (its own copy said "entirely skippable" — the
 * Documents register handles it post-create) and so is Integration (connectable later
 * from workspace → Integrations, where the webhook secret flow lives anyway).
 *
 * The Team step is capacity-aware: every row shows the candidate's booked load and
 * leave, over-allocation and leave-window collisions WARN (never block — the PM may
 * know something the calendar does not), and accepted warnings travel to the server
 * for the audit blob. A row with a role but NO person is valid — it becomes a
 * ResourceRequest on create (docs/30 §5), so the team shape is never lost.
 *
 * Draft policy: everything resumes from localStorage.
 */

const STEPS: WizardStep[] = [
  { key: "basics", label: "Basics" },
  { key: "team", label: "Team" },
  { key: "review", label: "Review" },
];
const NO_SKIPS = new Set<string>();

interface Portfolio {
  id: string;
  name: string;
  category: string;
  defaultMarkets: string[];
}
interface Programme {
  id: string;
  name: string;
  portfolioId: string | null;
}
interface Template {
  id: string;
  name: string;
  description: string | null;
  gates: string[];
}
interface TeamTemplate {
  id: string;
  name: string;
  shape: { role: string; allocationPct: number }[];
}
interface Market {
  id: string;
  code: string;
  name: string;
  flag: string | null;
}
interface Person {
  userId: string;
  name: string;
  totalPct: number;
  effectivePct: number;
  onLeaveUntil: string | null;
  /** Role hats this person holds across projects — drives the alternates soft sort. */
  roles: string[];
}

interface TeamRow {
  userId: string;
  role: string;
  allocationPct: number;
  startDate: string;
  endDate: string;
}

interface Draft {
  step: number;
  name: string;
  code: string;
  description: string;
  portfolioId: string;
  programmeId: string;
  checkpointTemplateId: string;
  pipelineStage: string;
  marketIds: string[];
  marketsTouched: boolean;
  team: TeamRow[];
}

const EMPTY: Draft = {
  step: 0,
  name: "",
  code: "",
  description: "",
  portfolioId: "",
  programmeId: "",
  checkpointTemplateId: "",
  pipelineStage: "Exploring",
  marketIds: [],
  marketsTouched: false,
  team: [],
};

/** Mirrors src/server/projects.ts projectCodeBase for the live "auto: XYZ" hint. */
function codePreview(name: string): string {
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const base = (words.length >= 2 ? words.slice(0, 3).map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3)).replace(/[^A-Z0-9]/g, "");
  return base.length >= 2 ? base : (base + "PRJ").slice(0, 3);
}

const LABEL = "text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase";
const SELECT = "mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm";

export function ProjectWizard({
  userId,
  portfolios,
  programmes,
  templates,
  teamTemplates,
  markets,
  people,
  preselectedPortfolioId,
  fromIdea,
}: {
  userId: string;
  portfolios: Portfolio[];
  programmes: Programme[];
  templates: Template[];
  teamTemplates: TeamTemplate[];
  markets: Market[];
  people: Person[];
  preselectedPortfolioId: string | null;
  /** M-P4a — the accepted idea this project comes from (docs/35 §1). DM1.73: sponsor
   * and expected value now survive the handoff instead of being dropped at the door. */
  fromIdea: { id: string; title: string; problem: string; sponsor: string; expectedValue: string | null } | null;
}) {
  const router = useRouter();
  const { busy, error, setError, mutate } = useAdminMutation();
  // M-P4a: an idea-driven run gets its OWN draft key, so accepting an idea never
  // resumes (or clobbers) a half-finished blank wizard, and vice versa.
  const key = draftKey(fromIdea ? `project.idea.${fromIdea.id}` : "project", userId);
  const [d, setD] = useState<Draft>({
    ...EMPTY,
    portfolioId: preselectedPortfolioId ?? "",
    name: fromIdea?.title.slice(0, 120) ?? "", // capped at the server limit (idea titles allow 140)
    description: fromIdea?.problem.slice(0, 500) ?? "",
  });
  const [loaded, setLoaded] = useState(false);

  // M-P4a seeds, hoisted so the resume effect can depend on plain strings (the fromIdea
  // object identity would change every render).
  const seedName = fromIdea?.title.slice(0, 120) ?? "";
  const seedDescription = fromIdea?.problem.slice(0, 500) ?? "";

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      // The idea's title/problem seed the fields, but a resumed draft's own edits win —
      // the PM's typing is never overwritten on a second visit.
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Draft>;
        setD({ ...EMPTY, name: seedName, description: seedDescription, ...saved });
      }
    } catch {
      /* corrupt draft — start clean */
    }
    setLoaded(true);
  }, [key, seedName, seedDescription]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(d));
    } catch {
      /* storage unavailable — wizard still works, just won't resume */
    }
  }, [d, key, loaded]);

  // DM1.73 — clamp resumes of pre-declutter drafts (saved on steps 3–6) into range.
  const step = Math.min(Math.max(d.step, 0), STEPS.length - 1);
  const cur = STEPS[step].key;
  const set = (patch: Partial<Draft>) => setD((c) => ({ ...c, ...patch }));
  const go = (i: number) => set({ step: i });

  const portfolio = portfolios.find((p) => p.id === d.portfolioId) ?? null;
  const personById = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  // Markets pre-fill from the portfolio until the user touches the chips (docs/26 §5.3).
  const effectiveMarkets = d.marketsTouched ? d.marketIds : (portfolio?.defaultMarkets ?? []);

  // DM1.73 — rows without a person are not an error: they become resource requests.
  const filledTeam = d.team.filter((t) => t.userId);
  const unfilledSeats = d.team.filter((t) => !t.userId);

  // ── Capacity warnings (docs/26 §4.3): informative, acceptable, audited.
  // DM1.73 — computed by the shared src/lib/capacity.ts (leave-aware effectivePct).
  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const row of d.team) {
      const p = personById.get(row.userId);
      if (!p) continue;
      out.push(...assignmentWarnings(p, row.allocationPct, { start: row.startDate || null, end: row.endDate || null }));
    }
    return out;
  }, [d.team, personById]);

  /** Alternates for an over-allocated row — role-fit SOFT sort (people already wearing
   * this row's role hat somewhere sort first), then leave-aware load; excludes people
   * already picked and people on leave inside the row's window. DM1.73: previously
   * claimed "same-role" while ignoring the row entirely. */
  function alternatesFor(row: TeamRow): Person[] {
    const chosen = new Set(d.team.map((t) => t.userId));
    const fit = (p: Person) => (p.roles.includes(row.role) ? 0 : 1);
    return people
      .filter((p) => {
        if (chosen.has(p.userId)) return false;
        if (p.onLeaveUntil && (!row.startDate || new Date(row.startDate) <= new Date(p.onLeaveUntil))) return false;
        return true;
      })
      .sort((a, b) => fit(a) - fit(b) || a.effectivePct - b.effectivePct)
      .slice(0, 2);
  }

  function validate(stepKey: string): boolean {
    if (stepKey === "basics") {
      if (d.name.trim().length < 2) return setError("Name is required."), false;
      if (!d.portfolioId) return setError("Every project belongs to a portfolio."), false;
    }
    setError(null);
    return true;
  }

  async function create() {
    if (!validate("basics")) {
      go(STEPS.findIndex((s) => s.key === "basics"));
      return;
    }
    // DM1.73 — the idea's expected value rides the description with an explicit prefix:
    // Project has no dedicated field for it (decision noted in project-wizard.ts).
    const desc = d.description.trim();
    const description = fromIdea?.expectedValue
      ? `${desc}${desc ? "\n\n" : ""}Expected value: ${fromIdea.expectedValue}`.slice(0, 500)
      : desc;
    await mutate(
      "/api/projects/wizard",
      "POST",
      {
        name: d.name.trim(),
        fromIdeaId: fromIdea?.id ?? undefined,
        code: d.code.trim() || undefined,
        description: description || undefined,
        // DM1.73 — the idea's sponsor becomes the project's business owner.
        businessOwner: fromIdea?.sponsor || undefined,
        portfolioId: d.portfolioId,
        programmeId: d.programmeId || undefined,
        checkpointTemplateId: d.checkpointTemplateId || undefined,
        pipelineStage: d.pipelineStage,
        marketIds: effectiveMarkets,
        team: filledTeam.map((t) => ({
          userId: t.userId,
          role: t.role,
          allocationPct: t.allocationPct,
          startDate: t.startDate ? new Date(t.startDate).toISOString() : undefined,
          endDate: t.endDate ? new Date(t.endDate).toISOString() : undefined,
        })),
        // DM1.73 (docs/30 §5) — unfilled seats raise resource requests server-side, in
        // the same transaction as the project itself.
        unfilledSeats: unfilledSeats.map((t) => ({
          role: t.role,
          allocationPct: t.allocationPct,
          startDate: t.startDate ? new Date(t.startDate).toISOString() : undefined,
          endDate: t.endDate ? new Date(t.endDate).toISOString() : undefined,
        })),
        acceptedWarnings: warnings,
      },
      {
        fallback: "Could not create the project.",
        onSuccess: (data) => {
          try {
            window.localStorage.removeItem(key);
          } catch {
            /* ignore */
          }
          const id = (data as { project?: { id?: string } } | undefined)?.project?.id;
          router.push(id ? `/projects/${id}` : "/projects");
        },
      },
    );
  }

  function createAnother() {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setD({ ...EMPTY, portfolioId: preselectedPortfolioId ?? "" });
  }

  function applyTeamTemplate(t: TeamTemplate) {
    set({ team: t.shape.map((s) => ({ userId: "", role: s.role, allocationPct: s.allocationPct, startDate: "", endDate: "" })) });
  }
  const setRow = (i: number, patch: Partial<TeamRow>) =>
    set({ team: d.team.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const marketCodes = (ids: string[]) =>
    ids.map((id) => markets.find((m) => m.id === id)?.code ?? "?").join(" · ") || "—";

  return (
    <WizardShell
      steps={STEPS}
      current={step}
      skipped={NO_SKIPS}
      onStep={go}
      onBack={() => go(prevStep(STEPS, step, NO_SKIPS))}
      onNext={() => {
        if (!validate(cur)) return;
        go(nextStep(STEPS, step, NO_SKIPS));
      }}
      onCreate={create}
      onCreateAnother={createAnother}
      createLabel="Create project"
      busy={busy}
      error={error}
    >
      {cur === "basics" && (
        <WizardCard title="What is it, and where does it live?">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pj-name" className={LABEL}>Project name</label>
              <Input id="pj-name" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} className="mt-1.5" autoFocus />
            </div>
            <div>
              <label htmlFor="pj-code" className={LABEL}>Code · auto-suggested</label>
              <Input
                id="pj-code"
                value={d.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                placeholder={d.name ? `auto: ${codePreview(d.name)}` : "auto from name"}
                className="mt-1.5 font-mono"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className={LABEL}>Portfolio (required)</span>
              <select
                value={d.portfolioId}
                onChange={(e) => set({ portfolioId: e.target.value, programmeId: "", marketsTouched: false, marketIds: [] })}
                className={SELECT}
              >
                <option value="">— pick a portfolio —</option>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className={LABEL}>Programme (optional)</span>
              <select
                value={d.programmeId}
                onChange={(e) => set({ programmeId: e.target.value })}
                className={SELECT}
                disabled={!d.portfolioId}
              >
                <option value="">— none —</option>
                {programmes
                  .filter((pg) => pg.portfolioId === d.portfolioId)
                  .map((pg) => (
                    <option key={pg.id} value={pg.id}>
                      {pg.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label htmlFor="pj-desc" className={LABEL}>Description (optional)</label>
            <Input id="pj-desc" value={d.description} onChange={(e) => set({ description: e.target.value })} className="mt-1.5" />
          </div>

          {/* DM1.73 — Type & delivery folded in (was its own step). */}
          <div className="mt-4">
            <span className={LABEL}>Delivery template</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <OptionCard
                  key={t.id}
                  on={d.checkpointTemplateId === t.id}
                  onClick={() => set({ checkpointTemplateId: d.checkpointTemplateId === t.id ? "" : t.id })}
                  title={t.name}
                  desc={t.gates.join(" → ")}
                />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <span className={LABEL}>Pipeline stage</span>
            <div className="mt-2">
              {["Exploring", "Evaluating", "Approved"].map((st) => (
                <Chip key={st} on={d.pipelineStage === st} onClick={() => set({ pipelineStage: st })}>
                  {st}
                </Chip>
              ))}
            </div>
          </div>

          {/* DM1.73 — Markets folded in (was its own step); portfolio prefill kept. */}
          {markets.length > 0 && (
            <div className="mt-3">
              <span className={LABEL}>Markets</span>
              <div className="mt-2">
                {markets.map((m) => {
                  const on = effectiveMarkets.includes(m.id);
                  return (
                    <Chip
                      key={m.id}
                      on={on}
                      onClick={() =>
                        set({
                          marketsTouched: true,
                          marketIds: on ? effectiveMarkets.filter((x) => x !== m.id) : [...effectiveMarkets, m.id],
                        })
                      }
                    >
                      {m.flag ? `${m.flag} ` : ""}
                      {m.code}
                    </Chip>
                  );
                })}
                <p className="mt-2 text-[11px] text-[var(--ink4)]">
                  {portfolio && !d.marketsTouched && (portfolio.defaultMarkets.length ?? 0) > 0
                    ? `Pre-filled from ${portfolio.name} — trim or extend per project.`
                    : "Pick the subsidiaries this project targets."}
                </p>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-[var(--ink4)]">
            The template decides the Delivery tab&apos;s gates; % is always derived from gate states, never typed.
            Documents and integrations connect later from the workspace.
          </p>
        </WizardCard>
      )}

      {cur === "team" && (
        <WizardCard title="Who builds it?">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {teamTemplates.map((t) => (
              <Chip key={t.id} on={false} onClick={() => applyTeamTemplate(t)}>
                Apply template: {t.name}
              </Chip>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set({ team: [...d.team, { userId: "", role: "Developer", allocationPct: 50, startDate: "", endDate: "" }] })}
            >
              + Add row
            </Button>
          </div>
          {d.team.length === 0 ? (
            <p className="text-[12px] text-[var(--ink4)]">
              No team yet — apply a template or add rows. You can also staff later from the workspace.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {d.team.map((row, i) => {
                const p = row.userId ? personById.get(row.userId) : null;
                const rowWarnings = p
                  ? assignmentWarnings(p, row.allocationPct, { start: row.startDate || null, end: row.endDate || null })
                  : [];
                const over = p ? p.effectivePct + row.allocationPct > 100 : false;
                return (
                  <div key={i} className="rounded-[10px] border border-[var(--w08)] p-2.5">
                    <div className="grid items-end gap-2 sm:grid-cols-[1fr_150px_80px_110px_110px_32px]">
                      <div>
                        <span className={LABEL}>Person</span>
                        <select value={row.userId} onChange={(e) => setRow(i, { userId: e.target.value })} className={SELECT}>
                          <option value="">— unfilled → resource request —</option>
                          {people.map((pp) => (
                            <option key={pp.userId} value={pp.userId} disabled={d.team.some((t, j) => j !== i && t.userId === pp.userId)}>
                              {pp.name} · {pp.totalPct}% booked{pp.onLeaveUntil ? " · on leave" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className={LABEL}>Role hat</span>
                        <select value={row.role} onChange={(e) => setRow(i, { role: e.target.value })} className={SELECT}>
                          {PROJECT_ROLES.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className={LABEL}>Alloc %</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={row.allocationPct}
                          onChange={(e) => setRow(i, { allocationPct: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <span className={LABEL}>Start</span>
                        <Input type="date" value={row.startDate} onChange={(e) => setRow(i, { startDate: e.target.value })} className="mt-1.5" />
                      </div>
                      <div>
                        <span className={LABEL}>End</span>
                        <Input type="date" value={row.endDate} onChange={(e) => setRow(i, { endDate: e.target.value })} className="mt-1.5" />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove row"
                        onClick={() => set({ team: d.team.filter((_, j) => j !== i) })}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {!row.userId && (
                      <p className="mt-2 text-[11.5px] text-[var(--ink4)]">
                        → will raise a resource request for 1 {row.role} · {row.allocationPct}% to the Head of PMs.
                      </p>
                    )}
                    {rowWarnings.length > 0 && p && (
                      <p className="mt-2 rounded-[8px] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-2.5 py-1.5 text-[11.5px] text-[var(--warn)]">
                        ⚠ {rowWarnings.join(". ")}.
                        {over && alternatesFor(row).length > 0 && (
                          <>
                            {" "}
                            Alternates ({row.role} first, least loaded):{" "}
                            {alternatesFor(row).map((a, k) => (
                              <button
                                key={a.userId}
                                type="button"
                                className="font-semibold underline underline-offset-2"
                                onClick={() => setRow(i, { userId: a.userId })}
                              >
                                {k > 0 ? " · " : ""}
                                {a.name} ({a.effectivePct}%)
                              </button>
                            ))}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-[11px] text-[var(--ink4)]">
            A row without a person is fine — creating the project raises a resource request for that seat.
            Warnings inform, they never block — accepted ones are recorded in the audit trail.
          </p>
        </WizardCard>
      )}

      {cur === "review" && (
        <WizardCard title="Review — the whole project on one card">
          <table className="w-full text-[12.5px]">
            <tbody>
              {[
                ["Project", `${d.name.trim() || "—"} · ${d.code.trim() || `auto: ${d.name ? codePreview(d.name) : "—"}`}`],
                [
                  "Home",
                  `${portfolio?.name ?? "—"}${d.programmeId ? ` › ${programmes.find((p) => p.id === d.programmeId)?.name ?? ""}` : ""}`,
                ],
                [
                  "Delivery",
                  `${d.checkpointTemplateId ? templates.find((t) => t.id === d.checkpointTemplateId)?.name : "no template"} · stage ${d.pipelineStage}`,
                ],
                ["Markets", marketCodes(effectiveMarkets)],
                [
                  "Team",
                  filledTeam.length || unfilledSeats.length
                    ? `${filledTeam.length} people${unfilledSeats.length ? ` · ${unfilledSeats.length} unfilled seat${unfilledSeats.length > 1 ? "s" : ""}` : ""}${warnings.length ? ` · ${warnings.length} warning${warnings.length > 1 ? "s" : ""} accepted` : ""}`
                    : "— staff later",
                ],
              ].map(([l, v]) => (
                <tr key={l} className="border-b border-[var(--w06)] last:border-0">
                  <td className="w-[120px] py-2 text-[10px] font-semibold tracking-[0.8px] text-[var(--ink4)] uppercase">{l}</td>
                  <td className="py-2 font-semibold text-[var(--qink)]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* DM1.73 (docs/30 §5) — the unfilled seats promise, spelled out. */}
          {unfilledSeats.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 rounded-[8px] bg-[var(--wash2)] px-3 py-2 text-[11.5px] text-[var(--ink3)]">
              {unfilledSeats.map((s, i) => (
                <li key={i}>
                  1 {s.role} · {s.allocationPct}% → will raise a resource request
                </li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <div className="mt-3 rounded-[8px] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-3 py-2 text-[11.5px] text-[var(--warn)]">
              Creating accepts: {warnings.join("; ")}.
            </div>
          )}
        </WizardCard>
      )}
    </WizardShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Chip, OptionCard, WizardCard, WizardShell } from "@/components/wizard/wizard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftKey, nextStep, prevStep, settleStep, type WizardStep } from "@/lib/wizard";

/**
 * Project wizard (docs/26 §5.3): Basics → Type & delivery → Markets → Team → Docs &
 * requirements → Integration → Review. The Team step is capacity-aware: every row shows
 * the candidate's booked load and leave, over-allocation and leave-window collisions
 * WARN (never block — the PM may know something the calendar does not), and accepted
 * warnings travel to the server for the audit blob.
 *
 * Draft policy: everything resumes from localStorage EXCEPT the YouTrack token and any
 * attached file — a secret and megabytes respectively; neither belongs in web storage.
 */

const STEPS: WizardStep[] = [
  { key: "basics", label: "Basics" },
  { key: "delivery", label: "Type & delivery" },
  { key: "markets", label: "Markets" },
  { key: "team", label: "Team" },
  { key: "docs", label: "Docs & requirements" },
  { key: "integration", label: "Integration" },
  { key: "review", label: "Review" },
];

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
  marketIds: string[];
  marketsTouched: boolean;
  team: TeamRow[];
  docTitle: string;
  docKind: string;
  docContent: string;
  ytBaseUrl: string;
  ytProjectKey: string;
}

const EMPTY: Draft = {
  step: 0,
  name: "",
  code: "",
  description: "",
  portfolioId: "",
  programmeId: "",
  checkpointTemplateId: "",
  marketIds: [],
  marketsTouched: false,
  team: [],
  docTitle: "",
  docKind: "BRD",
  docContent: "",
  ytBaseUrl: "",
  ytProjectKey: "",
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
  youtrackEnabled,
}: {
  userId: string;
  portfolios: Portfolio[];
  programmes: Programme[];
  templates: Template[];
  teamTemplates: TeamTemplate[];
  markets: Market[];
  people: Person[];
  preselectedPortfolioId: string | null;
  youtrackEnabled: boolean;
}) {
  const router = useRouter();
  const { busy, error, setError, mutate } = useAdminMutation();
  const key = draftKey("project", userId);
  const [d, setD] = useState<Draft>({ ...EMPTY, portfolioId: preselectedPortfolioId ?? "" });
  const [loaded, setLoaded] = useState(false);
  // Never drafted: the token (secret) and the file (size).
  const [ytToken, setYtToken] = useState("");
  const [file, setFile] = useState<{ name: string; data: string } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setD({ ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) });
    } catch {
      /* corrupt draft — start clean */
    }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(d));
    } catch {
      /* storage unavailable — wizard still works, just won't resume */
    }
  }, [d, key, loaded]);

  const skipped = useMemo(() => new Set<string>(youtrackEnabled ? [] : ["integration"]), [youtrackEnabled]);
  const step = settleStep(STEPS, d.step, skipped);
  const cur = STEPS[step].key;
  const set = (patch: Partial<Draft>) => setD((c) => ({ ...c, ...patch }));
  const go = (i: number) => set({ step: i });

  const portfolio = portfolios.find((p) => p.id === d.portfolioId) ?? null;
  const personById = useMemo(() => new Map(people.map((p) => [p.userId, p])), [people]);
  // Markets pre-fill from the portfolio until the user touches the step (docs/26 §5.3).
  const effectiveMarkets = d.marketsTouched ? d.marketIds : (portfolio?.defaultMarkets ?? []);

  // ── Capacity warnings (docs/26 §4.3): informative, acceptable, audited.
  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const row of d.team) {
      const p = personById.get(row.userId);
      if (!p) continue;
      const projected = p.totalPct + row.allocationPct;
      if (projected > 100) out.push(`${p.name} would be at ${projected}% (over-allocated)`);
      if (p.onLeaveUntil) {
        const back = new Date(p.onLeaveUntil);
        if (!row.startDate || new Date(row.startDate) <= back) {
          out.push(`${p.name} is on leave until ${back.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
        }
      }
    }
    return out;
  }, [d.team, personById]);

  /** Same-role alternates for an over-allocated row: least loaded first, not already picked. */
  function alternatesFor(_row: TeamRow): Person[] {
    const chosen = new Set(d.team.map((t) => t.userId));
    return people
      .filter((p) => !chosen.has(p.userId) && !p.onLeaveUntil)
      .sort((a, b) => a.totalPct - b.totalPct)
      .slice(0, 2);
  }

  function validate(stepKey: string): boolean {
    if (stepKey === "basics") {
      if (d.name.trim().length < 2) return setError("Name is required."), false;
      if (!d.portfolioId) return setError("Every project belongs to a portfolio."), false;
    }
    if (stepKey === "team") {
      if (d.team.some((t) => !t.userId)) return setError("Every team row needs a person — or remove the row."), false;
    }
    if (stepKey === "integration" && (d.ytBaseUrl || d.ytProjectKey || ytToken)) {
      if (!d.ytBaseUrl || !d.ytProjectKey || !ytToken) {
        return setError("YouTrack needs base URL, project key AND token — or leave all three empty."), false;
      }
    }
    setError(null);
    return true;
  }

  async function create() {
    for (const k of ["basics", "team", "integration"]) {
      if (!validate(k)) {
        go(STEPS.findIndex((s) => s.key === k));
        return;
      }
    }
    await mutate(
      "/api/projects/wizard",
      "POST",
      {
        name: d.name.trim(),
        code: d.code.trim() || undefined,
        description: d.description.trim() || undefined,
        portfolioId: d.portfolioId,
        programmeId: d.programmeId || undefined,
        checkpointTemplateId: d.checkpointTemplateId || undefined,
        marketIds: effectiveMarkets,
        team: d.team.map((t) => ({
          userId: t.userId,
          role: t.role,
          allocationPct: t.allocationPct,
          startDate: t.startDate ? new Date(t.startDate).toISOString() : undefined,
          endDate: t.endDate ? new Date(t.endDate).toISOString() : undefined,
        })),
        document:
          d.docTitle.trim() && (d.docContent.trim() || file)
            ? {
                title: d.docTitle.trim(),
                kind: d.docKind,
                format: file ? "pdf" : "text",
                content: file ? undefined : d.docContent,
                fileData: file?.data,
              }
            : undefined,
        youtrack:
          youtrackEnabled && d.ytBaseUrl && d.ytProjectKey && ytToken
            ? { baseUrl: d.ytBaseUrl, projectKey: d.ytProjectKey, token: ytToken }
            : undefined,
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
    setYtToken("");
    setFile(null);
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
      skipped={skipped}
      onStep={go}
      onBack={() => go(prevStep(STEPS, step, skipped))}
      onNext={() => {
        if (!validate(cur)) return;
        go(nextStep(STEPS, step, skipped));
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
              <Input id="pj-name" value={d.name} onChange={(e) => set({ name: e.target.value })} className="mt-1.5" autoFocus />
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
        </WizardCard>
      )}

      {cur === "delivery" && (
        <WizardCard title="What kind of delivery is this?">
          <div className="grid gap-3 sm:grid-cols-2">
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
          <p className="mt-3 text-[11.5px] text-[var(--ink4)]">
            The template decides the Delivery tab&apos;s gates; % is always derived from gate states, never typed.
            Pipeline stage starts at <span className="font-semibold">Exploring</span> — promotion to Approved is a
            governance action, not a form field.
          </p>
        </WizardCard>
      )}

      {cur === "markets" && (
        <WizardCard title="Where will it go live?">
          {markets.length === 0 ? (
            <p className="text-[12px] text-[var(--ink4)]">No market org units exist yet.</p>
          ) : (
            <div>
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
          )}
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
                const projected = p ? p.totalPct + row.allocationPct : 0;
                const over = p && projected > 100;
                const leave = p?.onLeaveUntil ? new Date(p.onLeaveUntil) : null;
                const leaveClash = leave && (!row.startDate || new Date(row.startDate) <= leave);
                return (
                  <div key={i} className="rounded-[10px] border border-[var(--w08)] p-2.5">
                    <div className="grid items-end gap-2 sm:grid-cols-[1fr_150px_80px_110px_110px_32px]">
                      <div>
                        <span className={LABEL}>Person</span>
                        <select value={row.userId} onChange={(e) => setRow(i, { userId: e.target.value })} className={SELECT}>
                          <option value="">— pick —</option>
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
                          {["Project Manager", "Technical Lead", "Developer", "QA Engineer", "Implementor", "Business Analyst", "UX Designer"].map((r) => (
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
                    {(over || leaveClash) && p && (
                      <p className="mt-2 rounded-[8px] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-2.5 py-1.5 text-[11.5px] text-[var(--warn)]">
                        ⚠ {over ? `${p.name} would be at ${projected}% next fortnight.` : ""}
                        {leaveClash ? ` ${p.name} is on leave until ${leave!.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}
                        {over && alternatesFor(row).length > 0 && (
                          <>
                            {" "}
                            Least-loaded alternates:{" "}
                            {alternatesFor(row).map((a, k) => (
                              <button
                                key={a.userId}
                                type="button"
                                className="font-semibold underline underline-offset-2"
                                onClick={() => setRow(i, { userId: a.userId })}
                              >
                                {k > 0 ? " · " : ""}
                                {a.name} ({a.totalPct}%)
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
            Warnings inform, they never block — accepted ones are recorded in the audit trail.
          </p>
        </WizardCard>
      )}

      {cur === "docs" && (
        <WizardCard title="Anything to read before the build?">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="doc-title" className={LABEL}>Document title (optional)</label>
              <Input id="doc-title" value={d.docTitle} onChange={(e) => set({ docTitle: e.target.value })} className="mt-1.5" placeholder="e.g. BRD — Mobile Banking v2" />
            </div>
            <div>
              <span className={LABEL}>Kind</span>
              <select value={d.docKind} onChange={(e) => set({ docKind: e.target.value })} className={SELECT}>
                {["BRD", "URS", "SRS", "Plan", "Other"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <span className={LABEL}>PDF file — or paste text below</span>
            <input
              type="file"
              accept="application/pdf"
              className="mt-1.5 block w-full text-[12px] text-[var(--ink3)] file:mr-3 file:rounded-lg file:border file:border-[var(--w10)] file:bg-transparent file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[var(--ink2)]"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return setFile(null);
                if (f.size > 2 * 1024 * 1024) {
                  setError("PDFs over 2 MB — add them from the workspace register after create.");
                  e.target.value = "";
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setFile({ name: f.name, data: String(reader.result).split(",")[1] ?? "" });
                reader.readAsDataURL(f);
              }}
            />
            {file && <p className="mt-1 text-[11px] text-[var(--ok)]">✓ {file.name} attached (not saved in the draft — re-attach if you leave)</p>}
          </div>
          <div className="mt-3">
            <label htmlFor="doc-content" className={LABEL}>Text content</label>
            <textarea
              id="doc-content"
              rows={4}
              value={d.docContent}
              onChange={(e) => set({ docContent: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 text-sm"
            />
          </div>
          <p className="mt-2 text-[11.5px] text-[var(--ink4)]">
            Entirely skippable — the register accepts documents any time. Once a BRD/URS is in the register, the
            workspace offers requirement extraction with human approval of every candidate (docs/26 §9).
          </p>
        </WizardCard>
      )}

      {cur === "integration" && (
        <WizardCard title="Where does the truth come from?">
          <p className="text-[12px] leading-relaxed text-[var(--ink3)]">
            Link the YouTrack project and the board mirrors it read-only. Without a connection the Board tab shows an
            honest &quot;not connected&quot; state — never an empty lie. Connectable later from workspace → Integrations;
            the repository (commit automation) connects there too, because it mints a webhook secret you must copy once.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="yt-url" className={LABEL}>Base URL</label>
              <Input id="yt-url" value={d.ytBaseUrl} onChange={(e) => set({ ytBaseUrl: e.target.value })} placeholder="https://yt.example.com" className="mt-1.5" />
            </div>
            <div>
              <label htmlFor="yt-key" className={LABEL}>Project key</label>
              <Input id="yt-key" value={d.ytProjectKey} onChange={(e) => set({ ytProjectKey: e.target.value })} placeholder="MB2" className="mt-1.5 font-mono" />
            </div>
            <div>
              <label htmlFor="yt-token" className={LABEL}>Token</label>
              <Input id="yt-token" type="password" value={ytToken} onChange={(e) => setYtToken(e.target.value)} className="mt-1.5" />
              <p className="mt-1 text-[10.5px] text-[var(--ink4)]">Stored encrypted; never in the draft.</p>
            </div>
          </div>
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
                  d.checkpointTemplateId
                    ? `${templates.find((t) => t.id === d.checkpointTemplateId)?.name} · stage Exploring`
                    : "no template · stage Exploring",
                ],
                ["Markets", marketCodes(effectiveMarkets)],
                [
                  "Team",
                  d.team.length
                    ? `${d.team.length} people${warnings.length ? ` · ${warnings.length} warning${warnings.length > 1 ? "s" : ""} accepted` : ""}`
                    : "— staff later",
                ],
                ["Docs", d.docTitle.trim() && (d.docContent.trim() || file) ? `${d.docKind} · ${d.docTitle}` : "—"],
                [
                  "Integration",
                  youtrackEnabled && d.ytProjectKey && d.ytBaseUrl && ytToken ? `YouTrack ${d.ytProjectKey}` : "not connected",
                ],
              ].map(([l, v]) => (
                <tr key={l} className="border-b border-[var(--w06)] last:border-0">
                  <td className="w-[120px] py-2 text-[10px] font-semibold tracking-[0.8px] text-[var(--ink4)] uppercase">{l}</td>
                  <td className="py-2 font-semibold text-[var(--qink)]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

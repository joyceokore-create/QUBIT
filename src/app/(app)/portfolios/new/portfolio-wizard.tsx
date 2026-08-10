"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Chip, OptionCard, WizardCard, WizardShell } from "@/components/wizard/wizard-shell";
import { Input } from "@/components/ui/input";
import { draftKey, nextStep, prevStep, type WizardStep } from "@/lib/wizard";

/**
 * Portfolio wizard (docs/26 §5.1), decluttered DM1.73: Identity → Lens → Review.
 * Governance had nothing to configure (defaults come from roles) so the step is gone;
 * Markets folded into Lens — the chips only ever mattered when Rollout was chosen, so
 * they now appear right under the lens cards instead of being a step that Pipeline skips.
 */

const STEPS: WizardStep[] = [
  { key: "identity", label: "Identity" },
  { key: "lens", label: "Lens" },
  { key: "review", label: "Review" },
];
const NO_SKIPS = new Set<string>();

interface Market {
  id: string;
  code: string;
  name: string;
  flag: string | null;
}
interface Owner {
  id: string;
  name: string;
}

interface Draft {
  step: number;
  name: string;
  description: string;
  category: string;
  viewKind: string;
  ownerId: string;
  marketIds: string[];
}

const EMPTY: Draft = {
  step: 0,
  name: "",
  description: "",
  category: "Exploring",
  viewKind: "Pipeline",
  ownerId: "",
  marketIds: [],
};

export function PortfolioWizard({
  userId,
  markets,
  owners,
  selfId,
}: {
  userId: string;
  markets: Market[];
  owners: Owner[];
  selfId: string;
}) {
  const router = useRouter();
  const { busy, error, setError, mutate } = useAdminMutation();
  const key = draftKey("portfolio", userId);
  // DM1.73 — owner defaults to the creator: an exec creating a portfolio almost always
  // owns it, and "(me)" pre-selected is one less field to think about.
  const [d, setD] = useState<Draft>({ ...EMPTY, ownerId: selfId });
  const [loaded, setLoaded] = useState(false);

  // Draft resume (docs/26 §5: leave and come back). Load once, save on every change.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setD({ ...EMPTY, ownerId: selfId, ...(JSON.parse(raw) as Partial<Draft>) });
    } catch {
      /* corrupt draft — start clean */
    }
    setLoaded(true);
  }, [key, selfId]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(d));
    } catch {
      /* storage full/unavailable — the wizard still works, it just won't resume */
    }
  }, [d, key, loaded]);

  // DM1.73 — clamp resumes of pre-declutter drafts saved on steps 3/4 (Governance/old
  // Review) into the new 3-step range.
  const step = Math.min(Math.max(d.step, 0), STEPS.length - 1);
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const go = (i: number) => set({ step: i });

  function validateIdentity(): boolean {
    if (d.name.trim().length < 2) {
      setError("Name is required.");
      return false;
    }
    setError(null);
    return true;
  }

  async function create() {
    if (!validateIdentity()) {
      go(0);
      return;
    }
    await mutate(
      "/api/portfolios",
      "POST",
      {
        name: d.name.trim(),
        description: d.description.trim() || undefined,
        category: d.category,
        viewKind: d.viewKind,
        ownerId: d.ownerId || undefined,
        marketIds: d.viewKind === "Rollout" ? d.marketIds : [],
      },
      {
        fallback: "Could not create the portfolio.",
        onSuccess: (data) => {
          try {
            window.localStorage.removeItem(key);
          } catch {
            /* ignore */
          }
          const id = (data as { portfolio?: { id?: string } } | undefined)?.portfolio?.id;
          router.push(id ? `/portfolios/${id}` : "/portfolios");
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
    setD({ ...EMPTY, ownerId: selfId });
  }

  const marketName = (id: string) => markets.find((m) => m.id === id);
  const cur = STEPS[step].key;

  return (
    <WizardShell
      steps={STEPS}
      current={step}
      skipped={NO_SKIPS}
      onStep={go}
      onBack={() => go(prevStep(STEPS, step, NO_SKIPS))}
      onNext={() => {
        if (cur === "identity" && !validateIdentity()) return;
        go(nextStep(STEPS, step, NO_SKIPS));
      }}
      onCreate={create}
      onCreateAnother={createAnother}
      createLabel="Create portfolio"
      busy={busy}
      error={error}
    >
      {cur === "identity" && (
        <WizardCard title="Who is this portfolio, and who answers for it?">
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="pf-name" className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">
                Name
              </label>
              <Input
                id="pf-name"
                value={d.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Open Banking"
                className="mt-1.5"
                autoFocus
              />
              <p className="mt-1 text-[11px] text-[var(--ink4)]">Shown on cards, reports and the exec dashboard.</p>
            </div>
            <div>
              <label htmlFor="pf-desc" className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">
                Description (optional)
              </label>
              <Input
                id="pf-desc"
                value={d.description}
                onChange={(e) => set({ description: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">Owner</span>
                <select
                  value={d.ownerId}
                  onChange={(e) => set({ ownerId: e.target.value })}
                  className="mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                >
                  <option value="">— none yet —</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.id === selfId ? " (me)" : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[var(--ink4)]">Must be a Head or Executive.</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">Category</span>
                <div className="mt-2">
                  {["Approved", "Exploring", "Shelved"].map((c) => (
                    <Chip key={c} on={d.category === c} onClick={() => set({ category: c })}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </WizardCard>
      )}

      {cur === "lens" && (
        <WizardCard title="How does this portfolio want to be looked at?">
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionCard
              on={d.viewKind === "Pipeline"}
              onClick={() => set({ viewKind: "Pipeline" })}
              title="Pipeline"
              desc="Stage-grouped list — best for build portfolios moving through gates."
            />
            <OptionCard
              on={d.viewKind === "Rollout"}
              onClick={() => set({ viewKind: "Rollout" })}
              title="Rollout"
              desc="Project × market heat map — best for products going live across subsidiaries."
            />
          </div>
          {/* DM1.73 — markets live here now (was its own step that Pipeline skipped). */}
          {d.viewKind === "Rollout" && (
            <div className="mt-4">
              <span className="text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase">
                Which subsidiaries does it roll out to?
              </span>
              {markets.length === 0 ? (
                <p className="mt-2 text-[12px] text-[var(--ink4)]">
                  No market org units exist yet — an admin can add them under Subsidiaries.
                </p>
              ) : (
                <div className="mt-2">
                  {markets.map((m) => {
                    const on = d.marketIds.includes(m.id);
                    return (
                      <Chip
                        key={m.id}
                        on={on}
                        onClick={() =>
                          set({ marketIds: on ? d.marketIds.filter((x) => x !== m.id) : [...d.marketIds, m.id] })
                        }
                      >
                        {m.flag ? `${m.flag} ` : ""}
                        {m.code}
                      </Chip>
                    );
                  })}
                  <p className="mt-2 text-[11px] text-[var(--ink4)]">
                    Projects created inside inherit these — editable per project.
                  </p>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-[var(--ink4)]">
            This one choice sets the default view and whether the market heat map shows.
          </p>
        </WizardCard>
      )}

      {cur === "review" && (
        <WizardCard title="Review — create when it reads right">
          <table className="w-full text-[12.5px]">
            <tbody>
              {[
                ["Name", d.name.trim() || "—"],
                ["Owner", owners.find((o) => o.id === d.ownerId)?.name ?? "— none yet —"],
                ["Category", d.category],
                ["Lens", d.viewKind === "Rollout" ? "Rollout (heat map on)" : "Pipeline"],
                [
                  "Markets",
                  d.viewKind === "Rollout" && d.marketIds.length
                    ? d.marketIds.map((id) => marketName(id)?.code ?? "?").join(" · ")
                    : "—",
                ],
              ].map(([l, v]) => (
                <tr key={l} className="border-b border-[var(--w06)] last:border-0">
                  <td className="w-[130px] py-2 text-[10px] font-semibold tracking-[0.8px] text-[var(--ink4)] uppercase">{l}</td>
                  <td className="py-2 font-semibold text-[var(--qink)]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-[var(--ink4)]">
            Everything can be changed later from the portfolio&apos;s settings — creating is not a commitment ceremony.
            Governance defaults come from roles (docs/18 §7) — an ungoverned portfolio is impossible.
          </p>
        </WizardCard>
      )}
    </WizardShell>
  );
}

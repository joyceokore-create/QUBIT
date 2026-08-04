"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminMutation } from "@/components/admin/use-admin-mutation";
import { Chip, WizardCard, WizardShell } from "@/components/wizard/wizard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftKey, nextStep, prevStep, settleStep, type WizardStep } from "@/lib/wizard";

/**
 * Org-setup wizard (docs/31 §5): Brand → Markets & departments → Checkpoint templates →
 * Import people → First portfolio → finish. Resumability comes from the SERVER state
 * (what already exists shows per step); only the step position is drafted locally.
 * No temp passwords anywhere — imports mint M-O3 invite links.
 */

const STEPS: WizardStep[] = [
  { key: "brand", label: "Brand" },
  { key: "markets", label: "Markets & departments" },
  { key: "templates", label: "Checkpoint templates" },
  { key: "people", label: "Import people" },
  { key: "portfolio", label: "First portfolio" },
];

const ALL_MARKETS = [
  { code: "KE", flag: "🇰🇪" },
  { code: "TZ", flag: "🇹🇿" },
  { code: "UG", flag: "🇺🇬" },
  { code: "RW", flag: "🇷🇼" },
  { code: "BI", flag: "🇧🇮" },
  { code: "SS", flag: "🇸🇸" },
  { code: "DRC", flag: "🇨🇩" },
];

interface SetupState {
  done: boolean;
  brandColor: string;
  markets: number;
  departments: number;
  templates: number;
  invitedPeople: number;
  portfolios: number;
}

interface ImportResult {
  email: string;
  status: "invited" | "error";
  message?: string;
  acceptUrl?: string;
}

const LABEL = "text-[11px] font-semibold tracking-[0.6px] text-[var(--ink4)] uppercase";
const DONE = "rounded-[8px] bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] px-3 py-2 text-[11.5px] text-[var(--ok)]";

export function SetupWizard({ userId, state }: { userId: string; state: SetupState }) {
  const router = useRouter();
  const { busy, error, mutate } = useAdminMutation();
  const key = draftKey("orgsetup", userId);
  const [step, setStepRaw] = useState<number>(() => {
    if (typeof window === "undefined") return 0; // SSR pass — resume applies client-side
    try {
      return Number(window.localStorage.getItem(key) ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  const setStep = (i: number) => {
    setStepRaw(i);
    try {
      window.localStorage.setItem(key, String(i));
    } catch {
      /* ignore */
    }
  };

  const [brandColor, setBrandColor] = useState(state.brandColor);
  const [marketCodes, setMarketCodes] = useState<string[]>(ALL_MARKETS.map((m) => m.code));
  const [departments, setDepartments] = useState("Technology\nOperations\nFinance");
  const [csv, setCsv] = useState("");
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

  const none = new Set<string>();
  const current = settleStep(STEPS, step, none);
  const cur = STEPS[current].key;
  const post = (action: string, body: Record<string, unknown>, onSuccess?: (data?: unknown) => void) =>
    mutate(`/api/org-setup/${action}`, "POST", body, { fallback: "Step failed — try again.", onSuccess });

  async function finish() {
    await post("complete", {}, () => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <WizardShell
      steps={STEPS}
      current={current}
      onStep={setStep}
      onBack={() => setStep(prevStep(STEPS, current, none))}
      onNext={() => setStep(nextStep(STEPS, current, none))}
      onCreate={finish}
      createLabel={state.done ? "Re-finish setup" : "Finish setup"}
      busy={busy}
      error={error}
    >
      {cur === "brand" && (
        <WizardCard title="Whose colours does this tenant wear?">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="su-color" className={LABEL}>Brand colour</label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="su-color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="w-[120px] font-mono"
                  placeholder="#ED1C24"
                />
                <span className="size-8 rounded-[8px] border border-[var(--w10)]" style={{ background: brandColor }} />
              </div>
            </div>
            <Button type="button" disabled={busy} onClick={() => void post("brand", { brandColor })}>
              Save brand
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink4)]">
            A logo upload lands with tenant theming assets — colour is what the shell derives from today.
          </p>
        </WizardCard>
      )}

      {cur === "markets" && (
        <WizardCard title="Where does this organisation operate?">
          <span className={LABEL}>Rollout markets {state.markets > 0 && `· ${state.markets} already exist`}</span>
          <div className="mt-2">
            {ALL_MARKETS.map((m) => {
              const on = marketCodes.includes(m.code);
              return (
                <Chip
                  key={m.code}
                  on={on}
                  onClick={() => setMarketCodes(on ? marketCodes.filter((c) => c !== m.code) : [...marketCodes, m.code])}
                >
                  {m.flag} {m.code}
                </Chip>
              );
            })}
          </div>
          <div className="mt-3">
            <label htmlFor="su-depts" className={LABEL}>Departments — one per line {state.departments > 0 && `· ${state.departments} already exist`}</label>
            <textarea
              id="su-depts"
              rows={3}
              value={departments}
              onChange={(e) => setDepartments(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (marketCodes.length && (await post("markets", { codes: marketCodes }))) {
                  await post("departments", { names: departments.split("\n") });
                }
              }}
            >
              Seed markets & departments
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink4)]">Idempotent — re-running never duplicates.</p>
        </WizardCard>
      )}

      {cur === "templates" && (
        <WizardCard title="Which delivery gates ship out of the box?">
          {state.templates >= 2 ? (
            <p className={DONE}>✓ Both templates exist — Product build (BRD→Go-Live) and Market rollout.</p>
          ) : (
            <>
              <p className="text-[12.5px] text-[var(--ink3)]">
                Two templates ship seeded and stay editable in admin: <b>Product build</b> (BRD → Prototype → MVP1 →
                SIT → UAT → Go-Live) and <b>Market rollout</b> (Business Case → … → Rollout).
              </p>
              <Button type="button" disabled={busy} className="mt-3" onClick={() => void post("templates", {})}>
                Create the default templates
              </Button>
            </>
          )}
        </WizardCard>
      )}

      {cur === "people" && (
        <WizardCard title="Who works here?">
          <label htmlFor="su-csv" className={LABEL}>
            Paste CSV — name,email,role,group {state.invitedPeople > 0 && `· ${state.invitedPeople} invites pending`}
          </label>
          <textarea
            id="su-csv"
            rows={5}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"name,email,role,group\nAmina Njeri,amina@riverbank.example.invalid,ProjectManager,pm"}
            className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 font-mono text-[12px]"
          />
          <Button
            type="button"
            disabled={busy || !csv.trim()}
            className="mt-2"
            onClick={() =>
              void post("import", { csv }, (data) => {
                const d = data as { results?: ImportResult[]; parseErrors?: { line: number; message: string }[] };
                setImportResults([
                  ...(d.results ?? []),
                  ...(d.parseErrors ?? []).map((e) => ({ email: `line ${e.line}`, status: "error" as const, message: e.message })),
                ]);
              })
            }
          >
            Send invites
          </Button>
          {importResults && (
            <div className="mt-3 flex flex-col gap-1">
              {importResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[11.5px]">
                  <span
                    className={
                      r.status === "invited"
                        ? "rounded-full bg-[color-mix(in_oklab,var(--ok)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--ok)]"
                        : "rounded-full bg-[color-mix(in_oklab,var(--bad)_10%,transparent)] px-2 py-0.5 font-semibold text-[var(--bad)]"
                    }
                  >
                    {r.status}
                  </span>
                  <span className="text-[var(--qink)]">{r.email}</span>
                  {r.message && <span className="text-[var(--ink4)]">{r.message}</span>}
                  {r.acceptUrl && (
                    <button
                      type="button"
                      className="text-[var(--ink4)] underline underline-offset-2"
                      onClick={() => void navigator.clipboard?.writeText(r.acceptUrl!).catch(() => {})}
                    >
                      copy invite link
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-[var(--ink4)]">
            No temp passwords — each person gets a one-time set-password link (email, or the copyable link while the
            mailer is off). A bad row never blocks the rest.
          </p>
        </WizardCard>
      )}

      {cur === "portfolio" && (
        <WizardCard title="Where does the first work live?">
          {state.portfolios > 0 ? (
            <p className={DONE}>✓ {state.portfolios} portfolio{state.portfolios === 1 ? "" : "s"} already exist{state.portfolios === 1 ? "s" : ""}.</p>
          ) : (
            <p className="text-[12.5px] text-[var(--ink3)]">
              Create the first portfolio with the full wizard — category, lens and markets included.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button nativeButton={false} render={<Link href="/portfolios/new" />} variant="outline">
              Open the portfolio wizard →
            </Button>
            <span className="text-[11px] text-[var(--ink4)]">or skip — Finish setup below.</span>
          </div>
        </WizardCard>
      )}
    </WizardShell>
  );
}

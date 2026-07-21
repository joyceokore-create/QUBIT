import { Lock, KeyRound, Smartphone, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Enterprise controls stated as product facts (see CLAUDE.md: RLS, RBAC, TOTP
// MFA, audit log). Short descriptors give the band density without new claims.
const CONTROLS: { icon: LucideIcon; label: string; note: string }[] = [
  { icon: Lock, label: "Row-level security", note: "Tenant data isolated in the database — never crosses the boundary." },
  { icon: KeyRound, label: "RBAC", note: "Role-based access down to each action and field." },
  { icon: Smartphone, label: "TOTP MFA", note: "Time-based one-time codes on every sign-in." },
  { icon: ScrollText, label: "Full audit trail", note: "Every mutation recorded with actor and before/after." },
];

export function TrustBand() {
  return (
    <section id="security" className="px-6 py-20 sm:py-24" style={{ background: "var(--w02)" }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-8 md:grid-cols-[minmax(0,380px)_1fr] md:items-center md:gap-12">
          <div>
            <p className="mb-3 text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">Governance &amp; security</p>
            <h2 className="text-[30px] font-[800] leading-[1.08] tracking-[-1px] text-[var(--qink)] md:text-[40px]">
              Built for Riverbank Group &amp; KCB Group
            </h2>
            <p className="mt-3 max-w-[300px] text-pretty text-[14px] leading-[1.6] text-[var(--ink35)]">
              Enterprise governance is the default, not an add-on — so every team works inside the same guardrails.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {CONTROLS.map((c) => (
              <div key={c.label} className="flex items-start gap-3">
                <span className="grid size-9 flex-none place-items-center rounded-lg bg-[color-mix(in_oklab,var(--pbrand)_12%,transparent)]">
                  <c.icon className="size-[18px] text-[var(--pbrand)]" aria-hidden />
                </span>
                <div>
                  <div className="text-[14px] font-bold text-[var(--qink)]">{c.label}</div>
                  <p className="mt-0.5 text-pretty text-[12.5px] leading-[1.5] text-[var(--ink35)]">{c.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

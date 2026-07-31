"use client";

import type { UserGroup } from "@/lib/personas";

/**
 * DM1.43 — single-choice dashboard group: a person is onboarded as Exec, PM, or Member,
 * and a Member is exactly one of Dev / QA / Implementor. One declared group makes "where
 * they land" unambiguous. (Derived groups still union in at login — someone declared a
 * developer who leads a project still derives `pm`; this picker constrains what an admin
 * DECLARES, not what the system infers from real memberships.)
 */

const MEMBER_KINDS = ["developer", "qa", "implementor"] as const;
type MemberKind = (typeof MEMBER_KINDS)[number];

const TIER_LABELS: Record<string, string> = { executive: "Executive", pm: "PM", member: "Member" };
const KIND_LABELS: Record<MemberKind, string> = { developer: "Developer", qa: "QA", implementor: "Implementor" };

function isMemberKind(g: UserGroup | null): g is MemberKind {
  return g !== null && (MEMBER_KINDS as readonly string[]).includes(g);
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
      style={{
        borderColor: active ? "var(--brand)" : "var(--w10)",
        background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
        color: active ? "var(--brand)" : "var(--ink3)",
      }}
    >
      {label}
    </button>
  );
}

export function GroupPicker({ value, onChange }: { value: UserGroup | null; onChange: (g: UserGroup | null) => void }) {
  const tier = value === "executive" || value === "pm" ? value : isMemberKind(value) ? "member" : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Dashboard group" className="flex flex-wrap gap-1.5">
        {(["executive", "pm", "member"] as const).map((t) => (
          <Chip
            key={t}
            label={TIER_LABELS[t]}
            active={tier === t}
            // Clicking the active tier clears the choice (back to "decide from memberships").
            onClick={() => onChange(tier === t ? null : t === "member" ? "developer" : t)}
          />
        ))}
      </div>
      {tier === "member" && (
        <div role="radiogroup" aria-label="Member kind" className="flex flex-wrap gap-1.5 pl-2">
          {MEMBER_KINDS.map((k) => (
            <Chip key={k} label={KIND_LABELS[k]} active={value === k} onClick={() => onChange(k)} />
          ))}
        </div>
      )}
    </div>
  );
}

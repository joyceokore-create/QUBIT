"use client";

import { USER_GROUPS, type UserGroup } from "@/lib/personas";
import { GROUP_LABELS } from "@/components/admin/labels";

/**
 * Dashboard view picker (docs/17 §1.3) — presentation only, never permission.
 *
 * Two modes:
 *  - single (default, DM1.43): one declared group — Exec, PM, or Member(dev/qa/implementor),
 *    surfaced as a tier + member-kind. Used by the edit-groups dialog.
 *  - multiple: pick ANY number of the five views as flat toggles. Used by the create-user
 *    dialog, where a person may be given more than one dashboard view and switch between
 *    them. Derived groups still union in at login either way — this only caps what an admin
 *    DECLARES, not what the system infers from real memberships.
 *
 * Superadmin is NOT one of the five views (see src/lib/personas.ts): a super admin derives
 * every view and lands on the executive cockpit. When `allowSuperadmin` is set the picker
 * shows a "Superadmin" chip the parent wires to the PlatformSuperAdmin role; selecting it
 * clears the declared views.
 */

const MEMBER_KINDS = ["developer", "qa", "implementor"] as const;
type MemberKind = (typeof MEMBER_KINDS)[number];

const TIER_LABELS: Record<string, string> = { executive: "Executive", pm: "PM", member: "Member" };
const KIND_LABELS: Record<MemberKind, string> = { developer: "Developer", qa: "QA", implementor: "Implementor" };

function isMemberKind(g: UserGroup | null): g is MemberKind {
  return g !== null && (MEMBER_KINDS as readonly string[]).includes(g);
}

function Chip({
  label,
  active,
  dimmed = false,
  role = "radio",
  onClick,
}: {
  label: string;
  active: boolean;
  dimmed?: boolean;
  role?: "radio" | "checkbox";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={active}
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
      style={{
        borderColor: active ? "var(--brand)" : "var(--w10)",
        background: active ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
        color: active ? "var(--brand)" : "var(--ink3)",
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

interface CommonProps {
  /** Show the Superadmin chip (only where the actor may grant PlatformSuperAdmin). */
  allowSuperadmin?: boolean;
  /** Whether Superadmin is currently the chosen view (owned by the parent). */
  superadmin?: boolean;
  onSuperadminChange?: (on: boolean) => void;
}

type SingleProps = CommonProps & {
  multiple?: false;
  value: UserGroup | null;
  onChange: (g: UserGroup | null) => void;
};

type MultiProps = CommonProps & {
  multiple: true;
  values: UserGroup[];
  onValuesChange: (gs: UserGroup[]) => void;
};

export function GroupPicker(props: SingleProps | MultiProps) {
  const { allowSuperadmin = false, superadmin = false, onSuperadminChange } = props;

  const superadminChip = allowSuperadmin ? (
    <Chip label="Superadmin" active={superadmin} onClick={() => onSuperadminChange?.(!superadmin)} />
  ) : null;

  // Multi-select: flat toggles over the five views (docs/17 §1). Any combination allowed.
  if (props.multiple) {
    const { values, onValuesChange } = props;
    const toggle = (g: UserGroup) => {
      if (superadmin) onSuperadminChange?.(false);
      onValuesChange(values.includes(g) ? values.filter((v) => v !== g) : [...values, g]);
    };
    return (
      <div role="group" aria-label="Dashboard views" className="flex flex-wrap gap-1.5">
        {USER_GROUPS.map((g) => (
          <Chip
            key={g}
            role="checkbox"
            label={GROUP_LABELS[g]}
            active={!superadmin && values.includes(g)}
            dimmed={superadmin}
            onClick={() => toggle(g)}
          />
        ))}
        {superadminChip}
      </div>
    );
  }

  // Single-select: tier + member-kind (DM1.43).
  const { value, onChange } = props;
  const tier = value === "executive" || value === "pm" ? value : isMemberKind(value) ? "member" : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="Dashboard view" className="flex flex-wrap gap-1.5">
        {(["executive", "pm", "member"] as const).map((t) => (
          <Chip
            key={t}
            label={TIER_LABELS[t]}
            active={!superadmin && tier === t}
            dimmed={superadmin}
            onClick={() => {
              if (superadmin) onSuperadminChange?.(false);
              onChange(!superadmin && tier === t ? null : t === "member" ? "developer" : t);
            }}
          />
        ))}
        {superadminChip}
      </div>
      {!superadmin && tier === "member" && (
        <div role="radiogroup" aria-label="Member kind" className="flex flex-wrap gap-1.5 pl-2">
          {MEMBER_KINDS.map((k) => (
            <Chip key={k} label={KIND_LABELS[k]} active={value === k} onClick={() => onChange(k)} />
          ))}
        </div>
      )}
    </div>
  );
}

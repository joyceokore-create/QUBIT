"use client";

import { ChevronDown } from "lucide-react";
import { FOCUS, ragFill } from "@/lib/surface";

/**
 * docs/38 — the workspace's instance switch: the product ("All") and each instance it ships
 * to, as chips with the instance's RAG dot. Past six instances the rest fold into a native
 * select so the title row never wraps into a wall of chips. Written to `?instance=` by the
 * workspace so links and reloads keep the selection.
 */

export interface SwitchInstance {
  orgUnitId: string;
  code: string;
  flag: string | null;
  rag?: "Green" | "Amber" | "Red";
}

const MAX_CHIPS = 6;

export function InstanceSwitch({
  label,
  instances,
  value,
  onChange,
}: {
  /** The project's instanceLabel: Market | Subsidiary | Instance. */
  label: string;
  instances: SwitchInstance[];
  /** null = the product. */
  value: string | null;
  onChange: (orgUnitId: string | null) => void;
}) {
  if (instances.length === 0) return null;
  const shown = instances.slice(0, MAX_CHIPS);
  const rest = instances.slice(MAX_CHIPS);
  const restSelected = rest.find((i) => i.orgUnitId === value) ?? null;
  const chip = (on: boolean) =>
    `inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${FOCUS} ${
      on ? "border-[var(--qink)] bg-[var(--qink)] text-[var(--qcard)]" : "border-[var(--border)] text-[var(--ink3)] hover:border-[var(--ink4)] hover:text-[var(--qink)]"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${label} switch`}>
      <button type="button" onClick={() => onChange(null)} aria-pressed={value === null} className={chip(value === null)}>
        All
      </button>
      {shown.map((i) => {
        const on = value === i.orgUnitId;
        return (
          <button key={i.orgUnitId} type="button" onClick={() => onChange(i.orgUnitId)} aria-pressed={on} className={chip(on)} title={i.code}>
            {i.rag && <span className="size-[7px] rounded-full" style={ragFill(i.rag)} aria-hidden />}
            {i.flag ? `${i.flag} ` : ""}
            {i.code}
          </button>
        );
      })}
      {rest.length > 0 && (
        <label className={`${chip(Boolean(restSelected))} relative cursor-pointer pr-7`}>
          <span>{restSelected ? `${restSelected.flag ? `${restSelected.flag} ` : ""}${restSelected.code}` : `+${rest.length} more`}</span>
          <ChevronDown className="pointer-events-none absolute right-2 size-3.5" aria-hidden />
          <select
            aria-label={`More ${label.toLowerCase()}s`}
            value={restSelected?.orgUnitId ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">All</option>
            {rest.map((i) => (
              <option key={i.orgUnitId} value={i.orgUnitId}>
                {i.flag ? `${i.flag} ` : ""}
                {i.code}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

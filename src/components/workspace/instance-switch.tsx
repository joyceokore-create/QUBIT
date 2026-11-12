"use client";

import { FOCUS } from "@/lib/surface";

/**
 * docs/38 — the workspace's named-instance switch: the product itself ("Product") and each
 * named instance (Schools, Marketplace …). Sits under the market switch; written to
 * `?instance=` by the workspace. Selecting one scopes the Delivery gates to that instance
 * (in the selected market, or at product level).
 */
export function InstanceSwitch({
  instances,
  value,
  onChange,
}: {
  instances: { id: string; code: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  if (instances.length === 0) return null;
  const chip = (on: boolean) =>
    `inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${FOCUS} ${
      on ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)]" : "border-[var(--border)] text-[var(--ink3)] hover:border-[var(--ink4)] hover:text-[var(--qink)]"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Instance switch">
      <span className="mr-0.5 text-[10.5px] font-semibold uppercase tracking-[.8px] text-[var(--ink5)]">Instance</span>
      <button type="button" onClick={() => onChange(null)} aria-pressed={value === null} className={chip(value === null)}>
        Product
      </button>
      {instances.map((i) => (
        <button key={i.id} type="button" onClick={() => onChange(i.id)} aria-pressed={value === i.id} className={chip(value === i.id)} title={i.code}>
          {i.name}
        </button>
      ))}
    </div>
  );
}

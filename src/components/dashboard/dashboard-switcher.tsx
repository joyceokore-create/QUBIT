"use client";

import Link from "next/link";

export interface DashboardSwitcherOption {
  role: string;
  label: string;
}

/** Role-switcher pills (PROMPT §4) — multi-role users can view any dashboard their roles
 * allow. Hidden for single-role users. */
export function DashboardSwitcher({ options, current }: { options: DashboardSwitcherOption[]; current: string }) {
  if (options.length <= 1) return null;
  return (
    <div className="mx-auto flex w-full max-w-[1360px] items-center gap-1.5 px-6 pt-3">
      <span className="font-mono text-[9px] uppercase tracking-[1.5px] text-[var(--ink5)]">View as</span>
      {options.map((o) => {
        const active = o.role === current;
        return (
          <Link
            key={o.role}
            href={`/dashboard?view=${o.role}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-full bg-[var(--tbactivebg)] px-3 py-1 text-[11px] font-semibold text-[var(--tbactivec)]"
                : "rounded-full border border-[var(--hair)] px-3 py-1 text-[11px] font-semibold text-[var(--ink3)] transition-colors hover:border-brand"
            }
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

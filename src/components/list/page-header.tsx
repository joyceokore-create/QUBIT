import type { ReactNode } from "react";

/**
 * UX5 (L2, U3) — the shared page header: title and a one-line description on the left, the
 * page's actions (+ New …, Invite, Export) top right. Actions never sit in the toolbar row,
 * and the page's main action is its one filled primary button.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--ink3)]">{eyebrow}</div>}
        <h1 className="font-heading text-[24px] font-bold tracking-[-.5px] text-[var(--qink)]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-[var(--ink3)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-none flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

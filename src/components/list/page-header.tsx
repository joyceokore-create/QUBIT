import type { ReactNode } from "react";

/**
 * UX5 (L2) + design spec v2 (docs/08 § Page header): crumb/date line 11.5/600 ink3 (not
 * uppercase), title 22/800, a one-line description 13 ink3; actions top right, aligned to
 * the top. The page's main action is its one filled primary. Homes pass no actions.
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
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11.5px] font-semibold text-[var(--ds-ink3)]">{eyebrow}</div>}
        <h1 className="mt-0.5 font-sans text-[22px] font-extrabold tracking-[-.01em] text-[var(--ds-ink)]">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-[var(--ds-ink3)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-none flex-wrap items-center gap-2 sm:flex-nowrap">{actions}</div>}
    </header>
  );
}

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { CARD } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * Design spec v2 panels and rows (docs/08 § Panel, List rows). One card anatomy for home main
 * cards and rail cards: radius 18, padding 16×18, gap 12, title 16/700 + a TextLink at the
 * right. Rows use dotted rules, none after the last.
 */
export function Panel({ title, action, children, className, as: Tag = "section", labelledBy }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; as?: "section" | "div"; labelledBy?: string }) {
  return (
    <Tag className={cn(CARD, "flex min-w-0 flex-col gap-3 px-[18px] py-4", className)} style={{ background: "var(--ds-card)" }} aria-labelledby={labelledBy}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2.5">
          {title && (
            <h2 id={labelledBy} className="text-[16px] font-bold text-[var(--ds-ink)]">
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </Tag>
  );
}

/** Main column + 340px rail, gap 16; the rail stacks under the main column below lg. */
export function Columns({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_var(--ds-rail-w)]">
      <div className="flex min-w-0 flex-col gap-4">{main}</div>
      <aside className="flex min-w-0 flex-col gap-4">{rail}</aside>
    </div>
  );
}

/** Rail row (`.ri`): title 12.5/600 with a chip at the top right, sub 11.5 ink3, an optional
 * meter or action under it. */
export function PanelRow({ title, sub, chip, children }: { title: ReactNode; sub?: ReactNode; chip?: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-[5px] border-b border-dotted border-[var(--ds-line)] py-[9px] last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <b className="min-w-0 text-[12.5px] font-semibold text-[var(--ds-ink)]">{title}</b>
        {chip}
      </div>
      {sub && <span className="text-[11.5px] text-[var(--ds-ink3)]">{sub}</span>}
      {children}
    </li>
  );
}

export function PanelList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col p-0">
      {children}
    </ul>
  );
}

/** Home list row (`.row`): title + sub · chip · meta (92px, right) · action; dotted rule. */
export function ListRow({ title, sub, chip, meta, action }: { title: ReactNode; sub?: ReactNode; chip?: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-dotted border-[var(--ds-line)] px-1 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_92px_auto]">
      <div className="flex min-w-0 flex-col">
        <b className="truncate text-[13px] font-semibold text-[var(--ds-ink)]">{title}</b>
        {sub && <span className="truncate text-[12px] text-[var(--ds-ink3)]">{sub}</span>}
      </div>
      <div className="justify-self-end sm:justify-self-auto">{chip}</div>
      <div className="hidden text-right text-[11.5px] tabular-nums text-[var(--ds-ink3)] sm:block">{meta}</div>
      <div className="col-span-2 flex justify-end sm:col-span-1">{action}</div>
    </li>
  );
}

/** Group heading inside a list (`.grp`): light uppercase label, no band. ink3 for AA. */
export function ListGroup({ children }: { children: ReactNode }) {
  return <li className="px-1 pb-0.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--ds-ink3)]">{children}</li>;
}

/** Footnote under a home list (`.foot`): "Showing 6 of 11" · link. Homes use this, not a pager. */
export function Foot({ children, action }: { children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex justify-between gap-2.5 pt-0.5 text-[12px] text-[var(--ds-ink3)]">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** "Suggested from project signals" pill (`.sug`). */
export function SuggestedPill({ children = "Suggested from project signals" }: { children?: ReactNode }) {
  return (
    <span className="-mt-1 inline-flex items-center gap-[5px] self-start rounded-full bg-[var(--ds-surface2)] px-[9px] py-0.5 text-[11px] font-semibold text-[var(--ds-ink3)]">
      <Sparkles className="size-3" aria-hidden />
      {children}
    </span>
  );
}

/** Banner (`.banner`): info or warn wash, 12.5 ink, no icon. */
export function Banner({ tone = "info", children, className }: { tone?: "info" | "warn"; children: ReactNode; className?: string }) {
  return (
    <div role={tone === "warn" ? "alert" : "note"} className={cn("rounded-[10px] px-3 py-2.5 text-[12.5px] text-[var(--ds-ink)]", className)} style={{ background: tone === "warn" ? "var(--ds-warnw)" : "var(--ds-infow)" }}>
      {children}
    </div>
  );
}

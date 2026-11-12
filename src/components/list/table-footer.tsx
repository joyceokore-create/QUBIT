"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES, pageWindow, type PageInfo, type PageSize } from "@/lib/list-state";
import { CARD, FIELD_FOCUS, FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX5 (L2/L3) + design spec v2 (docs/08 § Table, Pager): the table card holds only the table,
 * its empty/loading/error state and the pager, inset by the card padding (16×18). The pager
 * is ALWAYS shown, even when everything fits on one page (controls then disabled): "Showing
 * 1–10 of 48" left; "Rows" chip, icon-only Previous/Next and bordered page squares right,
 * the current page filled charcoal.
 */

export function TableCard({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <section className={cn(CARD, "relative flex flex-col gap-3 overflow-hidden px-[18px] py-4")} style={{ background: "var(--ds-card)" }}>
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </section>
  );
}

const PAGE_BTN = `inline-grid h-[var(--ds-control-h-compact)] min-w-[28px] place-items-center rounded-[var(--ds-radius-pager)] border px-1.5 text-[12px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;
const PAGE_OFF = "border-[var(--ds-line)] bg-[var(--ds-card)] text-[var(--ds-ink2)] hover:bg-[var(--ds-surface2)]";
const PAGE_ON = "border-[var(--ds-ink)] bg-[var(--ds-ink)] text-[var(--ds-card)] disabled:opacity-100";

export function TableFooter({
  info,
  onPage,
  onSize,
  noun = "rows",
}: {
  info: PageInfo;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
  /** Plural noun for screen readers, e.g. "projects". */
  noun?: string;
}) {
  const { page, pageCount, total, from, to, size } = info;
  const single = pageCount <= 1;
  return (
    <nav aria-label={`Pages of ${noun}`} className="flex flex-col gap-3 border-t border-[var(--ds-line)] pt-3 text-[12px] tabular-nums text-[var(--ds-ink3)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <p aria-live="polite">{total === 0 ? `Showing 0 of 0` : `Showing ${from}–${to} of ${total}`}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="mr-2 inline-flex items-center gap-1.5">
          Rows
          <span className="relative inline-flex">
            <select
              value={size}
              aria-label="Rows per page"
              onChange={(e) => onSize(Number(e.target.value) as PageSize)}
              className={`h-[var(--ds-control-h-compact)] appearance-none rounded-[var(--ds-radius-pager)] border border-[var(--ds-line)] bg-[var(--ds-card)] pl-2 pr-6 text-[12px] font-semibold text-[var(--ds-ink)] ${FIELD_FOCUS}`}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-[var(--ds-ink3)]" aria-hidden />
          </span>
        </label>
        <button type="button" aria-label="Previous page" className={cn(PAGE_BTN, PAGE_OFF)} disabled={single || page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
        {pageWindow(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-0.5 text-[var(--ds-ink3)]" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              disabled={single}
              onClick={() => onPage(p)}
              className={cn(PAGE_BTN, p === page ? PAGE_ON : PAGE_OFF)}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" className={cn(PAGE_BTN, PAGE_OFF)} disabled={single || page >= pageCount} onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

/**
 * L5 — an empty state says why and what next: "No risks match these filters · Clear filters"
 * is different from "No risks yet" (+ the create action, when the person may create).
 */
export function ListEmpty({
  filtered,
  noun,
  onClear,
  action,
  hint,
}: {
  /** True when search/filters are hiding rows; false when there are none at all. */
  filtered: boolean;
  /** Plural noun, e.g. "risks". */
  noun: string;
  onClear?: () => void;
  action?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-[14px] font-semibold text-[var(--ds-ink)]">{filtered ? `No ${noun} match these filters` : `No ${noun} yet`}</p>
      {hint && <p className="max-w-[48ch] text-[12.5px] text-[var(--ds-ink3)]">{hint}</p>}
      {filtered && onClear ? (
        <button type="button" onClick={onClear} className={`mt-1 text-[12.5px] font-semibold text-[var(--ds-brand-ink)] underline-offset-2 hover:underline ${FOCUS}`}>
          Clear filters
        </button>
      ) : (
        action && <div className="mt-1">{action}</div>
      )}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES, pageWindow, type PageInfo, type PageSize } from "@/lib/list-state";
import { CARD, FOCUS } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * UX5 (L2/L3) — the table card holds only the table, its empty/loading/error state and this
 * footer. The footer is ALWAYS shown, even when everything fits on one page (the controls are
 * then disabled): "Showing 1–10 of 48" left; rows per page and Previous / pages / Next right.
 */

export function TableCard({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <section className={cn(CARD, "relative overflow-hidden")} style={{ background: "var(--qcard)" }}>
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </section>
  );
}

const PAGE_BTN = `inline-flex h-[var(--control-h-compact)] min-w-[28px] items-center justify-center rounded-[8px] px-1.5 text-[12.5px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

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
    <nav aria-label={`Pages of ${noun}`} className="flex flex-col gap-3 border-t border-[var(--border)] px-4 py-3 text-[12.5px] text-[var(--ink3)] sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">
        {total === 0 ? `Showing 0 of 0` : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          Rows per page
          <select
            value={size}
            onChange={(e) => onSize(Number(e.target.value) as PageSize)}
            className={`h-[var(--control-h-compact)] rounded-[8px] border border-[var(--input)] bg-[var(--qcard)] px-2 text-[12.5px] font-semibold text-[var(--qink)] ${FOCUS}`}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" className={cn(PAGE_BTN, "gap-1 px-2 text-[var(--ink2)] hover:bg-[var(--surface-2)]")} disabled={single || page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
            <span className="max-sm:sr-only">Previous</span>
          </button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1" aria-hidden>
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
                className={cn(PAGE_BTN, p === page ? "bg-[var(--brand)] text-[var(--onbrand)] disabled:opacity-100" : "text-[var(--ink2)] hover:bg-[var(--surface-2)]")}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={cn(PAGE_BTN, "gap-1 px-2 text-[var(--ink2)] hover:bg-[var(--surface-2)]")} disabled={single || page >= pageCount} onClick={() => onPage(page + 1)}>
            <span className="max-sm:sr-only">Next</span>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
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
      <p className="text-[14px] font-semibold text-[var(--qink)]">{filtered ? `No ${noun} match these filters` : `No ${noun} yet`}</p>
      {hint && <p className="max-w-[48ch] text-[12.5px] text-[var(--ink3)]">{hint}</p>}
      {filtered && onClear ? (
        <button type="button" onClick={onClear} className={`mt-1 text-[13px] font-semibold text-[var(--brand)] underline-offset-2 hover:underline ${FOCUS}`}>
          Clear filters
        </button>
      ) : (
        action && <div className="mt-1">{action}</div>
      )}
    </div>
  );
}

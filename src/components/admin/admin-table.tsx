"use client";

import type { ReactNode } from "react";
import { CARD, THEAD, TROW } from "@/lib/surface";
import { cn } from "@/lib/utils";

/**
 * The shared admin directory table — design spec v2 (docs/08 § Table): a real <table> on a card
 * with the standard header band (`THEAD`) and dotted rows (`TROW`), the same as Users,
 * Departments and Access Requests. The page header already carries the title and count, so the
 * table has no caption bar (an sr-only <caption> names it).
 *
 * Presentational only: callers render their own cells and own their data/mutations.
 */

export interface AdminColumn<T> {
  key: string;
  header: string;
  /** Column width, e.g. "110px"; omit to share the remaining space. Grid-track values such as
   * "minmax(0,1.6fr)" are accepted for compatibility and ignored. */
  width: string;
  render: (row: T) => ReactNode;
  align?: "start" | "end";
}

const fixedWidth = (w: string) => (/^\d+(px|%)$/.test(w.trim()) ? w.trim() : undefined);

export function AdminTable<T>({
  title,
  columns,
  rows,
  getRowKey,
  empty = "Nothing here yet.",
  minWidth = 720,
}: {
  /** Names the table for screen readers. */
  title: string;
  /** Kept for call-site compatibility; the count lives in the page header. */
  count?: number;
  countLabel?: string;
  columns: AdminColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: string;
  minWidth?: number;
  action?: ReactNode;
}) {
  return (
    <section className={cn(CARD, "flex flex-col gap-3 overflow-hidden px-[18px] py-4")} style={{ background: "var(--ds-card)" }}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-[var(--ds-ink3)]">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-left text-[12.5px]" style={{ minWidth }}>
            <caption className="sr-only">{title}</caption>
            <thead className={THEAD}>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.align === "end" ? "text-right!" : undefined} style={{ width: fixedWidth(c.width) }}>
                    {c.header === "Actions" ? <span className="sr-only">Actions</span> : c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={getRowKey(row)} className={cn(TROW, "transition-colors hover:[&>td]:bg-[var(--ds-surface2)]")}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("min-w-0", c.align === "end" && "text-right", i === 0 ? "text-[var(--ds-ink)]" : "text-[var(--ds-ink2)]")}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

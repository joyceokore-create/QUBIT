"use client";

import type { ReactNode } from "react";

/**
 * The shared admin directory table (docs/21 M-O2b). Tokens and spacing are lifted verbatim
 * from the users directory (`admin/users/users-client.tsx`) so adopting screens look
 * identical to the one that already sets the standard — this is consolidation, not a
 * restyle. No colours are invented here.
 *
 * Presentational only: callers render their own cells and own their data/mutations.
 */

export interface AdminColumn<T> {
  key: string;
  header: string;
  /** A grid-template track, e.g. "minmax(0,1.6fr)" or "120px". */
  width: string;
  render: (row: T) => ReactNode;
  align?: "start" | "end";
}

const CARD =
  "rounded-[16px] border border-[var(--cardbd)] shadow-[var(--cardsh)] backdrop-blur-[var(--glassblur)] backdrop-saturate-[1.25]";

export function AdminTable<T>({
  title,
  count,
  countLabel,
  columns,
  rows,
  getRowKey,
  empty = "Nothing here yet.",
  minWidth = 720,
  action,
}: {
  title: string;
  /** Defaults to rows.length; pass explicitly when the caption counts something else. */
  count?: number;
  /** Singular noun for the caption, e.g. "team" → "1 TEAM" / "3 TEAMS". */
  countLabel?: string;
  columns: AdminColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty?: string;
  /** Horizontal-scroll floor, matching the users directory default. */
  minWidth?: number;
  /** Optional trailing slot in the caption bar. */
  action?: ReactNode;
}) {
  const grid = `grid items-center gap-3.5`;
  const template = columns.map((c) => c.width).join(" ");
  const n = count ?? rows.length;
  const caption = countLabel
    ? `${n} ${(n === 1 ? countLabel : `${countLabel}s`).toUpperCase()}`
    : null;

  return (
    <div className={`overflow-hidden ${CARD}`} style={{ background: "var(--cardbg)" }}>
      <div className="flex items-center gap-3.5 border-b border-[var(--hair)] p-[13px_18px]">
        <span className="font-heading text-[14px] rv:text-heading-xs font-bold text-[var(--qink)]">{title}</span>
        {caption && (
          <span className="font-mono rv:font-sans text-[10px] rv:text-overline tracking-[1px] text-[var(--ink4)]">
            {caption}
          </span>
        )}
        <span className="flex-1" />
        {action}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className={`${grid} border-b border-[var(--hair)] p-[9px_18px] font-mono rv:font-sans text-[9px] rv:text-overline font-semibold uppercase tracking-[1.6px] text-[var(--ink4)]`}
            style={{ gridTemplateColumns: template }}
          >
            {columns.map((c) => (
              <span key={c.key} className={c.align === "end" ? "justify-self-end" : undefined}>
                {c.header}
              </span>
            ))}
          </div>

          {rows.length === 0 && (
            <p className="p-[18px] text-[12px] text-[var(--ink3)]">{empty}</p>
          )}

          {rows.map((row) => (
            <div
              key={getRowKey(row)}
              className={`${grid} border-b border-[var(--hair2)] p-[11px_18px] transition-colors last:border-0 hover:bg-[var(--wash)]`}
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((c) => (
                <span key={c.key} className={`min-w-0 ${c.align === "end" ? "justify-self-end" : ""}`}>
                  {c.render(row)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

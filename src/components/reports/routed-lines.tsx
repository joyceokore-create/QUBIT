"use client";

import { HealthPill } from "@/components/ui/status-pill";
import { TextButton } from "@/components/ui/text-link";
import type { RoutedLine } from "@/components/reports/status-workspace-model";

/**
 * Reports › Weekly Update — lines a colleague's status report sent to this project (plan
 * Phase 2). "Use This" lays the line on the card like a line of your own file; it is applied
 * (and the colleague told) only when you save or send the card. "Dismiss" declines it.
 */
export function RoutedLines({
  lines,
  used,
  locked,
  onUse,
  onDismiss,
}: {
  lines: RoutedLine[];
  /** Row ids already laid on the card, waiting for Save or Send. */
  used: string[];
  locked: boolean;
  onUse: (r: RoutedLine) => void;
  onDismiss: (r: RoutedLine) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 rounded-[var(--ds-radius-kv)] bg-[var(--ds-infow)] p-3" aria-label="Lines sent to you from colleagues' reports">
      {lines.map((r) => {
        const isUsed = used.includes(r.rowId);
        return (
          <li key={r.rowId} className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[12.5px] text-[var(--ds-ink2)]">
                From <b className="font-semibold text-[var(--ds-ink)]">{r.from}</b>&apos;s report <span className="text-[var(--ds-ink3)]">({r.fileName})</span>
                <b className="mt-0.5 block font-semibold text-[var(--ds-ink)]">“{r.row.update || r.row.stage || r.row.project}”</b>
              </span>
              {r.row.status && <HealthPill value={r.row.status} className="flex-none" />}
            </div>
            {isUsed ? (
              <span className="text-[12px] text-[var(--ds-info-text)]">On the card. Save or send to apply it.</span>
            ) : (
              <div className="flex flex-wrap gap-x-3">
                <TextButton onClick={() => !locked && onUse(r)}>
                  Use This
                </TextButton>
                <TextButton onClick={() => !locked && onDismiss(r)} className="text-[var(--ds-ink3)]">
                  Dismiss
                </TextButton>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

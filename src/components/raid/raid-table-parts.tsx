import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** UX5 — the list-table look shared by the Risks, Issues and Gap report tables (matches
 * the Projects list: 11px uppercase header row, hairline rows, surface-2 hover). */
export const RAID_THEAD = "border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--ink3)]";
export const RAID_ROW = "border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-2)]";

export function RaidTh({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("px-3 py-2.5 font-semibold", className)}>
      {children}
    </th>
  );
}

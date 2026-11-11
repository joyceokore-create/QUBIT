import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { THEAD, TROW } from "@/lib/surface";

/** UX5 — the list-table look shared by the Risks, Issues and Gap report tables (matches
 * the Projects list: 11px uppercase header row, hairline rows, surface-2 hover). */
// Design spec v2 (docs/08 § Table): grey band header, dotted rows.
export const RAID_THEAD = THEAD;
export const RAID_ROW = `${TROW} transition-colors hover:[&>td]:bg-[var(--ds-surface2)]`;

export function RaidTh({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn(className)}>
      {children}
    </th>
  );
}

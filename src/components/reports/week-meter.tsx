import type { ReactNode } from "react";
import { ragChipStyle, ragFill } from "@/lib/surface";

// Milestone B — the card header that says how far a week has got: "N of M sent · K to
// send", one filled bar, and whatever belongs on the right (the RAG tally, a Nudge all).

export function WeekMeter({
  done,
  total,
  label,
  sub,
  ariaLabel,
  children,
}: {
  done: number;
  total: number;
  label: ReactNode;
  sub?: ReactNode;
  ariaLabel: string;
  children?: ReactNode;
}) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-[var(--hair2)] p-[14px_18px]">
      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <div className="text-[14px] text-[var(--qink)]">
          <b className="font-semibold">{label}</b>
          {sub && <span className="text-[var(--ink4)]"> · {sub}</span>}
        </div>
        <div
          role="progressbar"
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="flex h-1.5 w-full max-w-[360px] overflow-hidden rounded-full bg-[var(--wash2)]"
        >
          <span className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, ...ragFill("Green") }} />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Labelled G/A/R chips — never bare dots — with zero counts omitted. */
export function RagTally({ counts, label = "Status across these projects" }: { counts: { green: number; amber: number; red: number }; label?: string }) {
  const items = [
    { rag: "Green" as const, n: counts.green },
    { rag: "Amber" as const, n: counts.amber },
    { rag: "Red" as const, n: counts.red },
  ].filter((i) => i.n > 0);
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={label}>
      {items.map((i) => (
        <li key={i.rag} className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold" style={ragChipStyle(i.rag)}>
          <span className="size-[7px] rounded-full" style={ragFill(i.rag)} aria-hidden />
          {i.n} {i.rag}
        </li>
      ))}
    </ul>
  );
}

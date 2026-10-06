import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FOCUS } from "@/lib/surface";
import { VIEW_LABEL, type ReportsView } from "@/lib/reports-view";

// Milestone B — the page header's two controls: ‹ Week 41 · 6–10 Oct › and, for Heads,
// "Preview as". Both are plain links: the URL is the state.

const CONTROL = "inline-flex items-center gap-0.5 rounded-[8px] border border-[var(--input)] bg-background p-0.5";
const ARROW = `flex size-7 items-center justify-center rounded-[6px] text-[var(--ink4)] transition-colors hover:text-[var(--qink)] ${FOCUS}`;

export function WeekSwitcher({
  isoWeek,
  range,
  prev,
  next,
  currentWeek,
  hrefFor,
}: {
  isoWeek: string;
  range: string;
  prev: string;
  next: string | null;
  currentWeek: string;
  hrefFor: (week: string) => string;
}) {
  const n = isoWeek.split("-W")[1];
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <nav aria-label="Week" className={CONTROL}>
        <Link href={hrefFor(prev)} aria-label="Previous week" className={ARROW}>
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
        <span className="whitespace-nowrap px-2 text-[12.5px] font-semibold text-[var(--qink)]">
          Week {n} <span className="font-normal text-[var(--ink4)]">· {range}</span>
        </span>
        {next ? (
          <Link href={hrefFor(next)} aria-label="Next week" className={ARROW}>
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span aria-disabled="true" aria-label="Next week" className="flex size-7 cursor-default items-center justify-center rounded-[6px] text-[var(--ink5)]">
            <ChevronRight className="size-3.5" aria-hidden />
          </span>
        )}
      </nav>
      {isoWeek !== currentWeek && (
        <Link href={hrefFor(currentWeek)} className={`rounded-[4px] text-[12px] font-semibold text-[var(--ink3)] transition-colors hover:text-brand ${FOCUS}`}>
          This week
        </Link>
      )}
    </div>
  );
}

export function PreviewSwitch({ view, hrefFor }: { view: ReportsView; hrefFor: (view: ReportsView) => string }) {
  const views: ReportsView[] = ["pm", "head", "exec"];
  return (
    <div role="radiogroup" aria-label="Preview as" className={`${CONTROL} flex-wrap`}>
      {views.map((v) => {
        const on = v === view;
        return (
          <Link
            key={v}
            href={hrefFor(v)}
            role="radio"
            aria-checked={on}
            className={`flex h-7 items-center whitespace-nowrap rounded-[6px] px-2.5 text-[12px] font-semibold transition-colors ${FOCUS} ${on ? "bg-[var(--qink)] text-background" : "text-[var(--ink3)] hover:text-[var(--qink)]"}`}
          >
            {VIEW_LABEL[v]}
          </Link>
        );
      })}
    </div>
  );
}

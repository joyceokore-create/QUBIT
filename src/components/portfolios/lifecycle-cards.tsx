import { Fragment } from "react";
import { ArrowRight, Check, Compass, Lightbulb, Rocket, Scale, type LucideIcon } from "lucide-react";
import { CARD } from "@/lib/surface";
import { stageToken } from "@/lib/status-words";
import { cn } from "@/lib/utils";
import type { CardStage, LifecycleCard } from "@/lib/initiatives";

/**
 * UX10 (D8b) — the five lifecycle cards, joined by arrows. Each is the standard white KPI
 * card with the stage colour on the icon chip, the title and the figure only. Anatomy, top
 * to bottom: icon chip → stage name → figure → one context line (amber when something is
 * stuck) → the change line last (omitted until four weeks of history exist). Display-only:
 * the tabs below do the filtering. No chart, no unit dots — same height at any count.
 */
const ICON: Record<CardStage, LucideIcon> = { Intake: Lightbulb, Exploring: Compass, Evaluating: Scale, Approved: Check, Live: Rocket };

export function LifecycleCards({ cards }: { cards: LifecycleCard[] }) {
  return (
    <section
      aria-label="Initiatives by lifecycle stage"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(4,minmax(0,1fr)_16px)_minmax(0,1fr)] lg:gap-2"
    >
      {cards.map((c, i) => {
        const tok = `var(${stageToken(c.stage)})`;
        const Icon = ICON[c.stage];
        return (
          <Fragment key={c.stage}>
            <div className={cn(CARD, "flex min-w-0 flex-col gap-1 px-4 py-3.5")} style={{ background: "var(--cardbg)" }}>
              <span
                aria-hidden
                className="mb-1 flex size-8 flex-none items-center justify-center rounded-full"
                style={{ color: tok, background: `color-mix(in oklab, ${tok} 12%, transparent)` }}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-[12.5px] font-semibold" style={{ color: tok }}>
                {c.stage}
              </span>
              <span className="text-[24px] font-bold leading-tight tabular-nums" style={{ color: tok }}>
                {c.count}
              </span>
              <span className={cn("text-[12.5px]", c.contextWarn ? "font-semibold text-[var(--warn-ink)]" : "text-[var(--ink3)]")}>{c.context}</span>
              {c.change && (
                <span className="text-[12px] font-semibold" style={{ color: tok }}>
                  {c.change}
                </span>
              )}
            </div>
            {i < cards.length - 1 && (
              <span aria-hidden className="hidden items-center justify-center text-[var(--ink3)] lg:flex">
                <ArrowRight className="size-4" />
              </span>
            )}
          </Fragment>
        );
      })}
    </section>
  );
}

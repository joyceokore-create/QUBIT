import { Bell, ClipboardList, ListOrdered, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

// Each step carries its own theme-aware tint (all ≥4.5:1 as title text on the
// card in both themes): amber → blue → green → red.
const STEPS: { icon: LucideIcon; tone: string; title: string; body: string }[] = [
  { icon: Bell, tone: "var(--warn)", title: "Reminds", body: "Deadline nudges, stale-invite chasers and slippage alerts arrive before things go red — never after." },
  { icon: ClipboardList, tone: "var(--qinfo)", title: "Organizes", body: "Q drafts your steering packs and status updates from live portfolio data — you review, not rewrite." },
  { icon: ListOrdered, tone: "var(--pbrand)", title: "Prioritizes", body: "Your task list is re-ranked as dependencies shift — with a “why” behind every position." },
  { icon: Zap, tone: "var(--bad)", title: "Acts", body: "Approve, assign or escalate from the briefing — Q turns the recommendation into the next step." },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 px-6 py-20 sm:py-24" style={{ background: "var(--w02)" }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 max-w-[620px]">
          <p className="mb-3 text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">How Q works</p>
          {/* Black by default; each word reveals its step colour on hover
              (matches the cards below: amber / blue / green). */}
          <h2 className="text-[30px] font-[800] leading-[1.08] tracking-[-1px] text-[var(--qink)] md:text-[40px]">
            <span className="cursor-default transition-colors duration-200 hover:text-[var(--warn)]">Reminds.</span>{" "}
            <span className="cursor-default transition-colors duration-200 hover:text-[var(--qinfo)]">Organizes.</span>{" "}
            <span className="cursor-default transition-colors duration-200 hover:text-[var(--pbrand)]">Prioritizes.</span>
          </h2>
          <p className="mt-4 max-w-[520px] text-pretty text-[15px] leading-[1.6] text-[var(--ink35)] md:text-[16px]">
            From the first nudge to the final action, Q runs the loop for you — so every day opens with
            what matters, why it matters, and what to do next.
          </p>
        </div>

        {/* Numbered steps — left-aligned. Each step is its own `group` so the
            title still reveals its colour on hover. */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="group relative flex flex-col items-start text-left" style={{ "--tone": s.tone } as CSSProperties}>
              <span
                className="relative z-[1] mb-5 grid size-14 place-items-center rounded-2xl border transition-transform duration-300 ease-out group-hover:scale-110"
                style={{ background: `color-mix(in oklab, ${s.tone} 10%, var(--qcard))`, borderColor: `color-mix(in oklab, ${s.tone} 28%, transparent)` }}
              >
                <s.icon className="size-6" style={{ color: s.tone }} aria-hidden />
                <span
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-[10px] font-bold tabular-nums text-[var(--onbrand)]"
                  style={{ background: s.tone }}
                >
                  {i + 1}
                </span>
              </span>
              <h3 className="mb-1.5 text-[17px] font-bold text-[var(--qink)] transition-colors duration-200 group-hover:text-[var(--tone)]">{s.title}</h3>
              <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

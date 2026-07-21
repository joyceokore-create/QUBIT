import type { JSX } from "react";

const STEPS = [
  { n: "1", title: "Reminds", body: "Deadline nudges, stale-invite chasers and slippage alerts arrive before things go red — never after." },
  { n: "2", title: "Organizes", body: "Q drafts your steering packs and status updates from live portfolio data — you review, not rewrite." },
  { n: "3", title: "Prioritizes", body: "Your task list is re-ranked as dependencies shift — with a “why” behind every position." },
  { n: "4", title: "Acts", body: "Approve, assign or escalate from the briefing — Q turns the recommendation into the next step." },
];

export function HowItWorks(): JSX.Element {
  return (
    <section id="how" className="px-6 py-20" style={{ background: "var(--w02)" }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-14 text-center">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[2.2px] text-[var(--pbrand)]">How Q works</div>
          <h2 className="text-[32px] font-bold tracking-[-.6px] text-[var(--qink)] md:text-[40px]">
            Reminds. Organizes. Prioritizes.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="text-center">
              <div
                className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[var(--pbrand)] text-[20px] font-bold text-[var(--onbrand)]"
                style={{ boxShadow: "0 6px 18px color-mix(in oklab, var(--pbrand) var(--glowA), transparent)" }}
              >
                {s.n}
              </div>
              <h3 className="mb-2 text-[18px] font-semibold text-[var(--qink)]">{s.title}</h3>
              <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

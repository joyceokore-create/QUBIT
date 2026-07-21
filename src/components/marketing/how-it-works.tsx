import { Bell, ClipboardList, ListOrdered, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Bell, title: "Reminds", body: "Deadline nudges, stale-invite chasers and slippage alerts arrive before things go red — never after." },
  { icon: ClipboardList, title: "Organizes", body: "Q drafts your steering packs and status updates from live portfolio data — you review, not rewrite." },
  { icon: ListOrdered, title: "Prioritizes", body: "Your task list is re-ranked as dependencies shift — with a “why” behind every position." },
  { icon: Zap, title: "Acts", body: "Approve, assign or escalate from the briefing — Q turns the recommendation into the next step." },
];

export function HowItWorks() {
  return (
    <section id="how" className="px-6 py-20 sm:py-24" style={{ background: "var(--w02)" }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-12 max-w-[620px]">
          <p className="mb-3 text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">How Q works</p>
          <h2 className="text-[30px] font-[800] leading-[1.08] tracking-[-1px] text-[var(--qink)] md:text-[40px]">
            Reminds. Organizes. <span className="text-[var(--pbrand)]">Prioritizes.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.title}
              className="q-card-hover group relative overflow-hidden rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-7 shadow-[var(--cardsh)]"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: "radial-gradient(320px 160px at 20% 0%, color-mix(in oklab, var(--pbrand) 8%, transparent), transparent 62%)" }}
              />
              <div className="relative">
                <span className="mb-5 grid size-11 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--pbrand)_13%,transparent)] transition-transform duration-300 ease-out group-hover:scale-110">
                  <s.icon className="size-[22px] text-[var(--pbrand)]" aria-hidden />
                </span>
                <h3 className="mb-2 text-[17px] font-bold text-[var(--qink)]">{s.title}</h3>
                <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

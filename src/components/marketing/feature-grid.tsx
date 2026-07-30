import { Bell, ListOrdered, LayoutGrid, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
  /** Optional second paragraph — used on shorter cells so they balance their wider neighbours. */
  body2?: string;
  /** Optional third paragraph — for cells that stretch to a tall neighbour. */
  body3?: string;
  /** Optional labelled tag row (e.g. ranking factors) to fill and enrich a cell. */
  factors?: string[];
};

// Flagship gets its own treatment (a mini briefing strip); the other three are
// compact. Deliberately unequal cells — not the identical icon-tile card grid.
const FLAGSHIP: Feature = {
  icon: Bell,
  tone: "var(--pbrand)",
  title: "A briefing, not a backlog",
  body: "Q opens your day with the three things that matter — ranked, explained, and one click from action.",
  body2: "No hunting through boards or filters — Q surfaces what changed overnight and what needs you first.",
};

const REST: Feature[] = [
  {
    icon: ListOrdered,
    tone: "var(--blue)",
    title: "Priorities with reasons",
    body: "Every task ranked by deadline, dependencies and risk — and Q shows its working, so you can trust the order.",
    body2: "Open any item to see the factors behind its position — no black box, and the ranking updates as things shift.",
  },
  { icon: LayoutGrid, tone: "var(--accent-indigo)", title: "Group to branch in two clicks", body: "Portfolios grouped by health, programmes, milestones and RAID — drill from group level to a single project." },
  {
    icon: ShieldCheck,
    tone: "var(--warn)",
    title: "Governed by default",
    body: "Row-level tenant isolation, RBAC and a full audit trail — enterprise controls without the friction.",
    body2: "Every action is scoped to the tenant and recorded with actor and before/after — so an audit is a query, not a scramble.",
  },
];

function Cell({ f, className = "" }: { f: Feature; className?: string }) {
  return (
    <div className={`q-card-hover group rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-7 shadow-[var(--cardsh)] ${className}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <f.icon className="size-5 transition-transform duration-300 ease-out group-hover:scale-110" style={{ color: f.tone }} aria-hidden />
        <h3 className="text-[16.5px] font-bold text-[var(--qink)]">{f.title}</h3>
      </div>
      <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{f.body}</p>
      {f.body2 && <p className="mt-3 text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{f.body2}</p>}
      {f.body3 && <p className="mt-3 text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{f.body3}</p>}
      {f.factors && (
        <div className="mt-5">
          <span className="mb-2 block text-[10.5px] font-bold uppercase tracking-[1.4px] text-[var(--ink4)]">Ranked by</span>
          <div className="flex flex-wrap gap-2">
            {f.factors.map((x) => (
              <span key={x} className="rounded-lg border border-[var(--hair2)] bg-[var(--card2)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink2)]">
                {x}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-[1180px] scroll-mt-20 px-6 py-20 sm:py-24">
      <div className="mb-12 max-w-[560px]">
        <p className="mb-3 text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">Core capabilities</p>
        <h2 className="text-[30px] font-[800] leading-[1.08] tracking-[-1px] text-[var(--qink)] md:text-[40px]">
          Why teams choose <span className="text-[var(--pbrand)]">QUBIT</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* Flagship — wide, richer, with a compact briefing strip. */}
        <div className="q-card-hover group relative overflow-hidden rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-7 shadow-[var(--cardsh)] md:col-span-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ backgroundImage: "radial-gradient(520px 300px at 88% 0%, color-mix(in oklab, var(--pbrand) 9%, transparent), transparent 62%)" }}
          />
          {/* Two-column: text/chips on the left (unchanged), a compact briefing
              preview fills the previously-empty right. Left content drives the
              card height, so this doesn't make the card taller. */}
          <div className="relative grid items-center gap-8 md:grid-cols-2">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <FLAGSHIP.icon className="size-5 transition-transform duration-300 ease-out group-hover:scale-110" style={{ color: FLAGSHIP.tone }} aria-hidden />
                <span className="text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">The daily briefing</span>
              </div>
              <h3 className="mb-3 max-w-[420px] text-[22px] font-bold leading-[1.15] tracking-[-.4px] text-[var(--qink)] md:text-[26px]">
                {FLAGSHIP.title}
              </h3>
              <p className="max-w-[440px] text-pretty text-[14.5px] leading-[1.6] text-[var(--ink3)]">
                {FLAGSHIP.body}
              </p>
            </div>

            {/* Right: a compact "today for you" briefing preview. Hidden on mobile
                (the card is single-column there). */}
            <div className="hidden md:block">
              <div className="rounded-2xl border border-[var(--hair2)] bg-[var(--card2)] p-4 shadow-[var(--cardsh)]">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[1.4px] text-[var(--ink4)]">Today · for you</span>
                  <span className="text-[10.5px] font-semibold text-[var(--pbrand)]">3 things</span>
                </div>
                {[
                  { n: 1, task: "Vendor selection sign-off", why: "Blocks 3 milestones", when: "Now", tone: "var(--bad)" },
                  { n: 2, task: "Steering pack for the board", why: "Meeting at 4:00 PM", when: "Today", tone: "var(--warn)" },
                  { n: 3, task: "Pilot branch go-live", why: "On track — review Fri", when: "This week", tone: "var(--pbrand)" },
                ].map((r) => (
                  <div key={r.n} className="flex items-center gap-3 border-t border-[var(--hair2)] py-2.5 first:border-t-0">
                    <span className="grid size-6 flex-none place-items-center rounded-md text-[11px] font-bold tabular-nums" style={{ background: `color-mix(in oklab, ${r.tone} 16%, transparent)`, color: r.tone }}>
                      {r.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--ink2)]">{r.task}</span>
                      <span className="block truncate text-[10.5px] text-[var(--ink4)]">{r.why}</span>
                    </span>
                    <span className="flex-none text-[9.5px] font-bold uppercase tracking-[.6px]" style={{ color: r.tone }}>{r.when}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Last cell goes wide, so the two rows read as an alternating bento
            (wide/narrow, then narrow/wide) rather than a uniform card grid. */}
        {REST.map((f, i) => (
          <Cell key={f.title} f={f} className={i === REST.length - 1 ? "md:col-span-2" : ""} />
        ))}
      </div>
    </section>
  );
}

import { Bell, ListOrdered, LayoutGrid, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
};

// Flagship gets its own treatment (a mini briefing strip); the other three are
// compact. Deliberately unequal cells — not the identical icon-tile card grid.
const FLAGSHIP: Feature = {
  icon: Bell,
  tone: "var(--pbrand)",
  title: "A briefing, not a backlog",
  body: "Q opens your day with the three things that matter — ranked, explained, and one click from action.",
};

const REST: Feature[] = [
  { icon: ListOrdered, tone: "var(--blue)", title: "Priorities with reasons", body: "Every task ranked by deadline, dependencies and risk — and Q shows its working, so you can trust the order." },
  { icon: LayoutGrid, tone: "var(--accent-indigo)", title: "Group to branch in two clicks", body: "Portfolio × subsidiary heatmaps, programmes, milestones and RAID — drill from group level to a single branch." },
  { icon: ShieldCheck, tone: "var(--warn)", title: "Governed by default", body: "Row-level tenant isolation, RBAC and a full audit trail — enterprise controls without the friction." },
];

const MINI = [
  { tone: "var(--bad)", label: "Now" },
  { tone: "var(--warn)", label: "Today" },
  { tone: "var(--pbrand)", label: "This week" },
];

function Cell({ f, className = "" }: { f: Feature; className?: string }) {
  return (
    <div className={`q-card-hover group rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-7 shadow-[var(--cardsh)] ${className}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <f.icon className="size-5 transition-transform duration-300 ease-out group-hover:scale-110" style={{ color: f.tone }} aria-hidden />
        <h3 className="text-[16.5px] font-bold text-[var(--qink)]">{f.title}</h3>
      </div>
      <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{f.body}</p>
    </div>
  );
}

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-[1180px] px-6 py-20 sm:py-24">
      <div className="mb-12 max-w-[560px]">
        <p className="mb-3 text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">Core capabilities</p>
        <h2 className="text-[30px] font-[800] leading-[1.08] tracking-[-1px] text-[var(--qink)] md:text-[40px]">
          Why teams choose <span className="text-[var(--pbrand)]">QUBIT</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* Flagship — wide, richer, with a compact briefing strip. */}
        <div className="q-card-hover group relative overflow-hidden rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-7 shadow-[var(--cardsh)] md:col-span-2 md:p-9">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{ backgroundImage: "radial-gradient(520px 300px at 88% 0%, color-mix(in oklab, var(--pbrand) 9%, transparent), transparent 62%)" }}
          />
          <div className="relative">
            <div className="mb-4 flex items-center gap-2">
              <FLAGSHIP.icon className="size-5 transition-transform duration-300 ease-out group-hover:scale-110" style={{ color: FLAGSHIP.tone }} aria-hidden />
              <span className="text-[13px] font-bold tracking-[-0.1px] text-[var(--pbrand)]">The daily briefing</span>
            </div>
            <h3 className="mb-3 max-w-[420px] text-[22px] font-bold leading-[1.15] tracking-[-.4px] text-[var(--qink)] md:text-[26px]">
              {FLAGSHIP.title}
            </h3>
            <p className="mb-7 max-w-[440px] text-pretty text-[14.5px] leading-[1.6] text-[var(--ink3)]">
              {FLAGSHIP.body}
            </p>

            {/* Mini strip echoing the hero mock — ranked, colour-coded, with reasons. */}
            <div className="flex flex-wrap gap-2.5">
              {MINI.map((m, i) => (
                <span
                  key={m.label}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--hair2)] bg-[var(--card2)] px-3 py-2 text-[12px] font-semibold text-[var(--ink2)]"
                >
                  <span className="grid size-5 place-items-center rounded-md text-[11px] font-bold tabular-nums" style={{ background: `color-mix(in oklab, ${m.tone} 16%, transparent)`, color: m.tone }}>
                    {i + 1}
                  </span>
                  {m.label}
                </span>
              ))}
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

import { Bell, ListOrdered, LayoutGrid, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: Bell, tone: "var(--pbrand)", title: "A briefing, not a backlog", body: "Q opens your day with the three things that matter — ranked, explained, and one click from action." },
  { icon: ListOrdered, tone: "var(--blue)", title: "Priorities with reasons", body: "Every task ranked by deadline, dependencies and risk — and Q shows its working, so you can trust the order." },
  { icon: LayoutGrid, tone: "var(--accent-indigo)", title: "Group to branch in two clicks", body: "Portfolio × subsidiary heatmaps, programmes, milestones and RAID — drill from group level to a single branch." },
  { icon: ShieldCheck, tone: "var(--warn)", title: "Governed by default", body: "Row-level tenant isolation, RBAC and a full audit trail — enterprise controls without the friction." },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-[1180px] px-6 py-20">
      <div className="mb-14 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--pbrand)_12%,transparent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pbrand)]">
          <span className="size-2 rounded-full bg-[var(--pbrand)]" />
          Core capabilities
        </div>
        <h2 className="text-[32px] font-bold tracking-[-.6px] text-[var(--qink)] md:text-[40px]">
          Why teams choose <span className="text-[var(--pbrand)]">QUBIT</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="q-card-hover group rounded-2xl border border-[var(--w07)] bg-[var(--qcard)] p-8"
          >
            <div
              className="mb-6 grid size-14 place-items-center rounded-xl transition-transform duration-300 ease-out group-hover:scale-110"
              style={{
                background: `color-mix(in oklab, ${f.tone} 15%, transparent)`,
                boxShadow: `0 6px 18px color-mix(in oklab, ${f.tone} var(--glowA), transparent)`,
              }}
            >
              <f.icon className="size-7" style={{ color: f.tone }} aria-hidden />
            </div>
            <h3 className="mb-3 text-[18px] font-bold text-[var(--qink)]">{f.title}</h3>
            <p className="text-pretty text-[13.5px] leading-[1.6] text-[var(--ink35)]">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

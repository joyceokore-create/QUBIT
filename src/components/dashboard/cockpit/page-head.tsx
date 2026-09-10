// Shared cockpit page header — reproduces the reference's page head: a date eyebrow, the
// title + subtitle, and the "Project lifecycle · phase → delivery stages" tiered model.
// The lifecycle model is product-level (tenant-agnostic), matching qubit-delivery-cockpit-v2.html.

const PHASES: { phase: string; stages: string[]; gate: string }[] = [
  { phase: "Initiation", stages: ["Idea", "Business Case"], gate: "Business case approved" },
  { phase: "Planning", stages: ["BRD", "Prototype"], gate: "BRD signed" },
  { phase: "Execution", stages: ["Build / MVP1", "SIT", "UAT"], gate: "UAT exit" },
  { phase: "Transition", stages: ["Go-Live", "Rollout"], gate: "CAB / go-live" },
  { phase: "Closure", stages: ["Production"], gate: "Benefits & closure" },
];

export function CockpitPageHead({ title, subtitle }: { title: string; subtitle: string }) {
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink4)]">{today} · Africa/Nairobi</div>
        <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[var(--qink)]">{title}</h1>
        <p className="mt-1 max-w-[68ch] text-[14px] text-[var(--ink2)]">{subtitle}</p>
      </div>
      <div className="hidden md:block">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink4)]">Project lifecycle · phase → delivery stages</div>
        <div className="flex flex-nowrap">
          {PHASES.map((p, i) => (
            <span
              key={p.phase}
              title={`Exit gate: ${p.gate}`}
              className={`flex flex-col gap-px border border-[var(--hair)] bg-[var(--wash2)] px-2.5 py-1 ${i === 0 ? "rounded-l-md" : ""} ${i === PHASES.length - 1 ? "rounded-r-md" : ""} ${i > 0 ? "-ml-px" : ""}`}
            >
              <b className="text-[11px] font-semibold text-[var(--ink2)]">{p.phase}</b>
              <small className="text-[10px] text-[var(--ink4)]">{p.stages.join(" · ")}</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

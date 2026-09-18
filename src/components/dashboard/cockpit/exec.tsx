import type { CockpitData, CockpitProject, GateKey } from "@/server/dashboard-cockpit";
import { GATE_KEYS } from "@/server/dashboard-cockpit";
import { briefLines } from "./ask-q-brief";
import { ExecV3, type ExecV3Props, type ExecRow } from "./exec-v3";

// Server wrapper for the Executive view — maps real tenant data into the approved
// artifact's shape (exec-v3.tsx renders its exact markup).

const STAGE_OF: Record<GateKey, { phase: string; stage: string }> = {
  brd: { phase: "Planning", stage: "BRD" },
  proto: { phase: "Planning", stage: "Prototype" },
  mvp1: { phase: "Execution", stage: "Build / MVP1" },
  sit: { phase: "Execution", stage: "SIT" },
  uat: { phase: "Execution", stage: "UAT" },
  golive: { phase: "Transition", stage: "Go-Live" },
};
const PHASES = ["Planning", "Execution", "Transition", "Closure"];
function stageOf(p: CockpitProject): { phase: string; stage: string } {
  for (const k of GATE_KEYS) if (p.gates[k] !== "done") return STAGE_OF[k];
  return { phase: "Closure", stage: "Production" };
}
const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";

const PRIO_GROUPS: { key: string; label: string; color: string }[] = [
  { key: "High", label: "High", color: "red" },
  { key: "Med", label: "Medium", color: "amber" },
  { key: "Low", label: "Low", color: "accent" },
  { key: "New", label: "New", color: "grey" },
  { key: "Strat", label: "Strategic", color: "grey" },
  { key: "Paused", label: "Paused", color: "grey" },
];

export function ExecCockpit({ data }: { data: CockpitData }) {
  const now = data.generatedAt;
  const all = data.projects;
  const active = all.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const approved = active.filter((p) => p.category === "Approved");
  const pool = approved.length ? approved : active;
  const ragOrder: Record<string, number> = { R: 0, A: 1, G: 2, N: 3 };
  const counts = {
    R: pool.filter((p) => p.calculated === "R").length,
    A: pool.filter((p) => p.calculated === "A").length,
    G: pool.filter((p) => p.calculated === "G").length,
    N: pool.filter((p) => p.calculated === "N").length,
  };
  const live = all.filter((p) => p.status === "Completed");
  const blocked = active.filter((p) => p.openBlockers > 0).length;

  // Decisions & GLC — derived from real escalation signals (the artifact used sample data).
  const decisionProjects = active
    .filter((p) => p.redRisks > 0 || (p.dispute && p.targetPassed) || (p.calculated === "R" && p.freshnessDays > 7))
    .sort((a, b) => b.freshnessDays - a.freshnessDays)
    .slice(0, 10);
  const glc: ExecV3Props["glc"] = decisionProjects.slice(0, 6).map((p) => ({
    a: `Resolve ${p.name} blockers and confirm support required`,
    o: p.pmName ?? "—",
    s: p.update ?? (p.targetPassed ? "Baseline target passed; awaiting decision." : "At risk — needs attention."),
    rag: p.calculated,
  }));

  const bucketDefs: { key: string; label: string; color: string }[] = [
    { key: "Approved", label: "Approved & in delivery", color: "var(--good)" },
    { key: "Exploring", label: "Exploring", color: "var(--v3amber)" },
    { key: "Shelved", label: "Shelved", color: "var(--v3grey)" },
    { key: "Unfiled", label: "Unfiled", color: "var(--v3grey)" },
  ];
  const buckets = bucketDefs
    .map((b) => ({ label: b.label, color: b.color, n: all.filter((p) => (p.category === b.key) || (b.key === "Unfiled" && !bucketDefs.some((x) => x.key === p.category))).length, names: all.filter((p) => p.category === b.key).map((p) => p.name).join(", ") }))
    .filter((b) => b.n > 0);

  const stageGroups = PHASES.map((phase) => ({ phase, names: pool.filter((p) => stageOf(p).phase === phase).map((p) => p.name) })).filter((g) => g.names.length > 0);

  const rows: ExecRow[] = pool
    .slice()
    .sort((x, y) => ragOrder[x.calculated] - ragOrder[y.calculated])
    .map((p) => {
      const { phase, stage } = stageOf(p);
      return {
        id: p.id,
        name: p.name,
        desc: p.desc,
        sub: p.markets[0]?.market ?? p.portfolioName ?? "—",
        phase,
        stage,
        lpo: p.hasBudget, // budget captured stands in for LPO-issued until an LPO field exists
        calc: p.calculated,
        rep: p.reported,
        dispute: p.dispute,
        dims: p.dims,
        target: fmt(p.dueDate),
        targetPast: p.targetPassed,
        support: p.update ?? "",
        prio: PRIO_GROUPS.some((g) => g.key === p.priority) ? p.priority : "New",
      };
    });

  const risks = active
    .flatMap((p) => p.risks.filter((r) => r.severity === "R").map((r) => ({ id: r.id, projectName: p.name, t: r.title, meta: `${r.id} · owner ${r.owner}` })))
    .slice(0, 5);

  return (
    <ExecV3
      briefLines={briefLines("exec", data, "")}
      generatedAt={now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      stats={{
        all: all.length,
        approved: pool.length,
        approvedCounts: counts,
        live: live.length,
        liveNames: live.slice(0, 2).map((p) => p.name).join(" · "),
        blocked,
        decisions: decisionProjects.length,
        decisionsOver30: decisionProjects.filter((p) => p.freshnessDays > 30).length,
        glc: glc.length,
        glcRed: glc.filter((g) => g.rag === "R").length,
      }}
      buckets={buckets}
      stageGroups={stageGroups}
      prioGroups={PRIO_GROUPS}
      rows={rows}
      trendRep={data.trend}
      // Calculated-RAG history isn't snapshotted yet — the reported series stands in until it is.
      trendCalc={data.trend}
      decisions={decisionProjects.map((p) => ({
        id: p.id,
        owner: p.pmName ?? "—",
        age: p.freshnessDays > 90 ? "no update" : `${p.freshnessDays}d waiting`,
        sev: p.calculated === "R" ? "R" : "A",
        t: p.risks.find((r) => r.severity === "R")?.title ?? (p.targetPassed ? `${p.name}: target passed — decide re-baseline or stop` : `${p.name}: at risk`),
        why: p.update ?? "Escalated from the delivery tracker.",
      }))}
      risks={risks}
      glc={glc}
    />
  );
}

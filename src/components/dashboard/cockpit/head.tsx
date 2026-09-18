import type { CockpitData, CockpitProject, GateKey } from "@/server/dashboard-cockpit";
import { GATE_KEYS, GATE_LABELS } from "@/server/dashboard-cockpit";
import { briefLines } from "./ask-q-brief";
import { HeadV3, type HeadV3Props, type HeadRow } from "./head-v3";

// Server wrapper for the Head of PMs view — maps real tenant data into the approved
// artifact's shape (head-v3.tsx renders its exact markup).

const STAGE_OF: Record<GateKey, { phase: string; stage: string }> = {
  brd: { phase: "Planning", stage: "BRD" },
  proto: { phase: "Planning", stage: "Prototype" },
  mvp1: { phase: "Execution", stage: "Build / MVP1" },
  sit: { phase: "Execution", stage: "SIT" },
  uat: { phase: "Execution", stage: "UAT" },
  golive: { phase: "Transition", stage: "Go-Live" },
};
function stageOf(p: CockpitProject): { phase: string; stage: string } {
  for (const k of GATE_KEYS) if (p.gates[k] !== "done") return STAGE_OF[k];
  return { phase: "Closure", stage: "Production" };
}
const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—";
const initialsOf = (name: string | null) =>
  (name ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || null;

const CATEGORY_BUCKETS: { key: string; label: string; color: string }[] = [
  { key: "Approved", label: "Approved & in delivery", color: "good" },
  { key: "Exploring", label: "Exploring", color: "amber" },
  { key: "Shelved", label: "Shelved", color: "grey" },
  { key: "Unfiled", label: "Unfiled", color: "teal" },
];

export function HeadCockpit({ data }: { data: CockpitData }) {
  const now = data.generatedAt;
  const active = data.projects.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const approved = active.filter((p) => p.category === "Approved");
  const counts = (list: CockpitProject[]) => ({
    R: list.filter((p) => p.calculated === "R").length,
    A: list.filter((p) => p.calculated === "A").length,
    G: list.filter((p) => p.calculated === "G").length,
    N: list.filter((p) => p.calculated === "N").length,
  });

  const disputes = active.filter((p) => p.dispute);
  const stale = active.filter((p) => p.freshnessDays > 7 && p.freshnessDays < 90).sort((x, y) => y.freshnessDays - x.freshnessDays);
  // Gate approvals waiting: projects whose derived Go-Live gate is live (in progress/late/blocked).
  const gatesWaiting = active.filter((p) => ["prog", "late", "block"].includes(p.gates.golive));
  const escal = active.filter((p) => p.redRisks > 0 || (p.targetPassed && p.calculated !== "G"));

  const pmCards: HeadV3Props["pmCards"] = data.pms.map((pm) => {
    const mine = active.filter((p) => p.pmId === pm.id);
    return {
      id: pm.id,
      initials: initialsOf(pm.name) ?? "PM",
      name: pm.name,
      title: "Project Manager",
      counts: counts(mine),
      n: mine.length,
      onTime: mine.filter((p) => p.freshnessDays <= 7).length,
      disputes: mine.filter((p) => p.dispute).length,
      allocPct: null, // per-PM allocation joins when workload is threaded per user
    };
  });

  const rows: HeadRow[] = active.map((p) => {
    const { phase, stage } = stageOf(p);
    return {
      id: p.id,
      name: p.name,
      desc: p.desc,
      pmInitials: initialsOf(p.pmName),
      prio: p.priority,
      phase,
      stage,
      gates: GATE_KEYS.map((k) => p.gates[k]),
      pct: p.pct,
      calc: p.calculated,
      rep: p.reported,
      dispute: p.dispute,
      target: fmt(p.dueDate),
      targetPast: p.targetPassed,
      upd: p.freshnessDays,
      bucket: CATEGORY_BUCKETS.some((b) => b.key === p.category) ? p.category : "Unfiled",
      pmId: p.pmId,
      daysToTarget: p.dueDate ? Math.round((new Date(p.dueDate).getTime() - now.getTime()) / 86_400_000) : 99999,
    };
  });

  // Resource conflicts — derived: overloaded PMs and same-week gate collisions.
  const conflicts: HeadV3Props["conflicts"] = [];
  for (const pm of data.pms) {
    const mine = active.filter((p) => p.pmId === pm.id);
    const trouble = mine.filter((p) => p.calculated !== "G");
    if (trouble.length >= 3) conflicts.push({ sev: "A", who: pm.name, title: `Carries ${trouble.length} red/amber projects`, desc: trouble.slice(0, 3).map((p) => p.name).join(", ") });
    const dated = mine.filter((p) => p.nextMilestone?.dueDate);
    for (let i = 0; i < dated.length; i++) for (let j = i + 1; j < dated.length; j++) {
      const da = new Date(dated[i].nextMilestone!.dueDate!).getTime();
      const db = new Date(dated[j].nextMilestone!.dueDate!).getTime();
      if (Math.abs(da - db) <= 7 * 86_400_000) conflicts.push({ sev: "R", who: pm.name, title: `${dated[i].name} and ${dated[j].name} have gates in the same week`, desc: "One may slip — sequence or re-baseline." });
    }
  }

  return (
    <HeadV3
      briefLines={briefLines("head", data, "")}
      generatedAt={now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      gateLabels={GATE_KEYS.map((k) => GATE_LABELS[k])}
      buckets={CATEGORY_BUCKETS}
      stats={{
        approved: approved.length,
        approvedCounts: counts(approved.length ? approved : active),
        disputes: disputes.length,
        stale: stale.length,
        stale14: stale.filter((p) => p.freshnessDays > 14).length,
        gatesWaiting: gatesWaiting.length,
        gatesOldest: gatesWaiting.length ? `oldest ${Math.max(...gatesWaiting.map((p) => Math.min(p.freshnessDays, 99)))}d` : "none waiting",
        escal: escal.length,
        overAlloc: 0,
        overAllocNames: "",
      }}
      pmCards={pmCards}
      disputes={disputes.map((p) => ({
        id: p.id,
        name: p.name,
        rep: p.reported,
        calc: p.calculated,
        pmName: p.pmName ?? "—",
        drivers: Object.entries(p.dims).filter(([, v]) => v === "R").map(([k]) => k).join(", ") || "—",
        targetNote: p.targetPassed && p.dueDate ? ` · target ${fmt(p.dueDate)} passed` : "",
      }))}
      stale={stale.map((p) => { const { phase, stage } = stageOf(p); return { id: p.id, name: p.name, upd: p.freshnessDays, phase, stage, calcLabel: { G: "Green", A: "Amber", R: "Red", N: "Not rated" }[p.calculated], pmName: p.pmName ?? "unassigned" }; })}
      gatesWaitingRows={gatesWaiting.map((p) => ({ id: p.id, name: p.name, gate: "Go-Live gate", since: `${Math.min(p.freshnessDays, 99)}d ago`, pmName: p.pmName ?? "—" }))}
      escalRows={escal.map((p) => ({ id: p.id, name: p.name, t: p.risks.find((r) => r.severity === "R")?.title ?? "Target passed — needs Director / Group action" }))}
      rows={rows}
      pms={data.pms.map((pm) => ({ id: pm.id, name: pm.name }))}
      conflicts={conflicts.slice(0, 6)}
      trend={data.trend}
    />
  );
}

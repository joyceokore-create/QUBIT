import type { CockpitData, CockpitProject, GateKey } from "@/server/dashboard-cockpit";
import { CALC_ORDER, GATE_KEYS, GATE_LABELS } from "@/server/dashboard-cockpit";
import { briefLines } from "./ask-q-brief";
import { PmV3, type PmV3Props, type V3Project, type V3QueueItem, type V3Risk } from "./pm-v3";

// Server wrapper for the PM Delivery Cockpit: maps real tenant data (CockpitProject[]) into
// the approved artifact's data shape and renders the 1:1 markup port (pm-v3.tsx).

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

const MARKET_FLAG: Record<string, string> = {
  Kenya: "🇰🇪", Tanzania: "🇹🇿", Uganda: "🇺🇬", Rwanda: "🇷🇼", Burundi: "🇧🇮", "South Sudan": "🇸🇸", DRC: "🇨🇩",
};

const daysTo = (d: Date | string, now: Date) => Math.round((new Date(d).getTime() - now.getTime()) / 86_400_000);

export function PmCockpit({
  data,
  viewerId,
  viewerName,
  allocationPct,
  now,
}: {
  data: CockpitData;
  viewerId: string;
  viewerName?: string;
  allocationPct?: number | null;
  now: Date;
}) {
  const owned = data.projects.filter((p) => p.pmId === viewerId && !["Completed", "Cancelled"].includes(p.status));
  const previewingAll = owned.length === 0;
  const mine = (previewingAll ? data.projects.filter((p) => !["Completed", "Cancelled"].includes(p.status)) : owned)
    .slice()
    .sort(
      (a, b) =>
        CALC_ORDER[a.calculated] - CALC_ORDER[b.calculated] ||
        daysTo(a.nextMilestone?.dueDate ?? "2099-01-01", now) - daysTo(b.nextMilestone?.dueDate ?? "2099-01-01", now),
    );

  const projects: V3Project[] = mine.map((p) => {
    const { phase, stage } = stageOf(p);
    return {
      id: p.id,
      name: p.name,
      calc: p.calculated,
      rep: p.reported,
      phase,
      stage,
      pct: p.pct,
      bucketShort: p.category === "Unfiled" ? "Unfiled" : p.category,
      bucketTitle: p.category === "Approved" ? "Approved & in delivery" : p.category,
      dispute: p.dispute,
      nextLabel: p.nextMilestone?.name ?? null,
      nextDate: p.nextMilestone?.dueDate ? fmt(p.nextMilestone.dueDate) : null,
      nextPast: Boolean(p.nextMilestone?.overdue),
      upd: p.freshnessDays,
      hasMarkets: p.markets.length > 0,
    };
  });

  // Work queue — the artifact's exact item set and action labels.
  const queue: V3QueueItem[] = [];
  for (const p of mine) {
    const { stage } = stageOf(p);
    const ms = p.nextMilestone;
    if (ms?.dueDate) {
      const d = daysTo(ms.dueDate, now);
      if (d < 0) queue.push({ k: "due", t: `${ms.name} overdue by ${-d}d`, d: "Milestone passed without closure — re-baseline or record the reason.", when: "Overdue", act: "Re-baseline", projectId: p.id, projectName: p.name });
      else if (d <= 7) queue.push({ k: "soon", t: ms.name, d: `${stage} · gate deliverables due`, when: d === 0 ? "Today" : `in ${d}d`, act: "Open", projectId: p.id, projectName: p.name });
    }
    if (p.dispute) {
      const drivers = (Object.entries(p.dims).filter(([, v]) => v === "R").map(([k]) => k).join(", ")
        || Object.entries(p.dims).filter(([, v]) => v === "A").map(([k]) => k).join(", "));
      queue.push({ k: "flag", t: `Reported ${p.reported} but calculates ${p.calculated}`, d: `Drivers: ${drivers || "—"}. Revise the rating or add justification before the weekly report.`, when: "Before Fri", act: "Review RAG", projectId: p.id, projectName: p.name });
    }
    for (const r of p.risks.filter((r) => r.severity === "R")) {
      queue.push({ k: "due", t: `${r.id} · ${r.title}`, d: `Owner: ${r.owner}. No acknowledgement recorded.`, when: "Unacknowledged", act: "Escalate", projectId: p.id, projectName: p.name });
    }
    if (p.freshnessDays >= 5 && p.freshnessDays < 900) {
      queue.push({ k: "info", t: "Weekly status update due", d: `Last update ${p.freshnessDays} days ago.`, when: "This week", act: "Update", projectId: p.id, projectName: p.name });
    }
  }
  const order = { due: 0, soon: 1, flag: 2, info: 3 };
  queue.sort((a, b) => order[a.k] - order[b.k]);

  // Collisions — projects with gate dates in the same week (artifact logic).
  const collisions: string[] = [];
  const byWeek = new Map<number, CockpitProject[]>();
  for (const p of mine) {
    if (!p.nextMilestone?.dueDate) continue;
    const w = Math.floor(daysTo(p.nextMilestone.dueDate, now) / 7);
    byWeek.set(w, [...(byWeek.get(w) ?? []), p]);
  }
  for (const group of byWeek.values()) {
    if (group.length > 1) collisions.push(`${group.map((p) => p.name).join(" and ")} both have gate dates in the same week`);
  }

  const risks: V3Risk[] = mine
    .flatMap((p) => p.risks.map((r) => ({ sev: r.severity as "R" | "A", t: r.title, meta: `${r.id} · owner ${r.owner}`, projectName: p.name, projectId: p.id })))
    .sort((a, b) => (a.sev === "R" ? 0 : 1) - (b.sev === "R" ? 0 : 1))
    .slice(0, 6);

  const overdueMilestones = mine.filter((p) => p.nextMilestone?.overdue).length;
  const upcoming = mine
    .filter((p) => p.nextMilestone?.dueDate && !p.nextMilestone.overdue)
    .sort((a, b) => daysTo(a.nextMilestone!.dueDate!, now) - daysTo(b.nextMilestone!.dueDate!, now));
  const gatesSoon = upcoming.filter((p) => daysTo(p.nextMilestone!.dueDate!, now) <= 7).length;
  const disputes = mine.filter((p) => p.dispute).length;
  const openRisks = mine.reduce((n, p) => n + p.redRisks, 0);

  const marketProject = mine.find((p) => p.markets.length > 0);
  const market: PmV3Props["market"] = marketProject
    ? {
        projectName: marketProject.name,
        gateLabels: GATE_KEYS.map((k) => GATE_LABELS[k]),
        rows: marketProject.markets.map((m) => ({
          name: m.market,
          flag: MARKET_FLAG[m.market] ?? "🏳️",
          pct: m.pct,
          gates: GATE_KEYS.map((k) => m.gates[k]),
          live: m.pct >= 100,
        })),
      }
    : null;

  const name = viewerName ?? "You";
  const initials = name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "PM";
  const ragCounts = {
    R: mine.filter((p) => p.calculated === "R").length,
    A: mine.filter((p) => p.calculated === "A").length,
    G: mine.filter((p) => p.calculated === "G").length,
    N: mine.filter((p) => p.calculated === "N").length,
  };

  return (
    <PmV3
      viewer={{ name, title: previewingAll ? "Project Manager (previewing all)" : "Project Manager", initials }}
      briefLines={briefLines("pm", data, viewerId)}
      generatedAt={now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      projects={projects}
      ragCounts={ragCounts}
      stats={{
        overdueMilestones,
        gatesSoon,
        nextUp: upcoming[0]?.nextMilestone?.name ?? "—",
        disputes,
        openRisks,
        allocPct: allocationPct ?? null,
      }}
      queue={queue}
      risks={risks}
      collisions={collisions}
      market={market}
    />
  );
}

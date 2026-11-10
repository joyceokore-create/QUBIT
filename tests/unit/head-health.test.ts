import { describe, expect, it } from "vitest";
import { buildDecisions, escalations, gatesInPlay, headKpis, pmLoad, staleProjects } from "@/lib/head-health";
import type { CockpitProject } from "@/server/dashboard-cockpit";

// UX8 — Head › Delivery health rules (same meaning as the old Head cockpit's figures).
const NONE = { brd: "none", proto: "none", mvp1: "none", sit: "none", uat: "none", golive: "none" } as const;

function project(id: string, over: Partial<CockpitProject> = {}): CockpitProject {
  return {
    id,
    code: id.toUpperCase(),
    name: `Project ${id}`,
    desc: "",
    category: "Approved",
    portfolioName: null,
    pmId: "pm1",
    pmName: "user_004",
    pmIds: ["pm1"],
    status: "InProgress",
    priority: "Med",
    reported: "G",
    reportedConfirmed: true,
    calculated: "G",
    signals: { status: "InProgress" },
    dispute: false,
    dims: {} as CockpitProject["dims"],
    pct: 40,
    dueDate: null,
    targetPassed: false,
    freshnessDays: 2,
    nextMilestone: null,
    openBlockers: 0,
    openRisks: 0,
    redRisks: 0,
    overdueTasks: 0,
    gates: { ...NONE },
    currentGate: null,
    buildTrack: true,
    coveragePct: null,
    risks: [],
    markets: [],
    update: null,
    hasBudget: false,
    ...over,
    // UX10: Approved = the lifecycle stage; derive it from the fixture's overrides.
    lifecycle: over.lifecycle ?? (over.status === "Completed" ? "Live" : over.status === "Cancelled" || over.priority === "Paused" ? "Inactive" : over.category && over.category !== "Approved" ? "Exploring" : "Approved"),
  };
}

const ps = [
  project("a", { gates: { ...NONE, golive: "block" } }),
  project("b", { gates: { ...NONE, golive: "prog" }, reported: "A" }),
  project("c", { dispute: true, reported: "G", calculated: "A" }),
  project("d", { freshnessDays: 40, pmName: null, pmIds: [] }),
  project("e", { freshnessDays: 10 }),
  project("f", { redRisks: 1, risks: [{ id: "r1", title: "Vendor SLA unsigned", severity: "R", owner: "—" }], reported: "R" }),
  project("g", { targetPassed: true, calculated: "A", category: "Exploring" }),
  project("h", { status: "Completed", gates: { ...NONE, golive: "block" }, dispute: true }),
];

describe("exception rules", () => {
  it("gates in play = the go-live gate is live; stale = 14+ days; escalate = red item or past target and not green", () => {
    expect(gatesInPlay(ps).map((p) => p.id)).toEqual(["a", "b"]);
    expect(staleProjects(ps).map((p) => p.id)).toEqual(["d"]);
    expect(escalations(ps).map((p) => p.id)).toEqual(["f", "g"]);
  });

  it("ignores completed projects everywhere", () => {
    expect(buildDecisions(ps).some((i) => i.projectId === "h")).toBe(false);
  });
});

describe("Needs your decision", () => {
  const items = buildDecisions(ps);

  it("labels every gate row as suggested from project signals, blocked first", () => {
    const gates = items.filter((i) => i.tab === "gates");
    expect(gates.map((i) => [i.projectId, i.chip.label])).toEqual([
      ["a", "Blocked"],
      ["b", "In progress"],
    ]);
    expect(gates.every((i) => i.sub.includes("Suggested from project signals"))).toBe(true);
  });

  it("words disputes with status words and offers Chase on stale updates", () => {
    expect(items.find((i) => i.tab === "disputes")?.title).toBe("Project c: reported On track, calculates At risk");
    expect(items.find((i) => i.tab === "stale")).toMatchObject({ title: "Project d: no check-in for 40 days", sub: "No PM", action: { kind: "nudge", projectId: "d" } });
    expect(items.find((i) => i.id === "esc-f")?.sub).toBe("Open red item: Vendor SLA unsigned");
    expect(items.find((i) => i.id === "esc-g")?.sub).toBe("Past its target date and not on track");
  });
});

describe("figures and PM load", () => {
  it("counts the approved portfolio by reported status", () => {
    expect(headKpis(ps)).toEqual({ approved: 6, byHealth: { ok: 4, warn: 1, bad: 1, none: 0 }, gates: 2, stale: 1, disputes: 1 });
  });

  it("lists PMs worst first and drops PMs with no live projects", () => {
    const load = pmLoad(ps, [
      { id: "pm1", name: "user_004" },
      { id: "pm2", name: "user_099" },
    ]);
    expect(load).toEqual([{ id: "pm1", name: "user_004", projects: 6, red: 1, amber: 1 }]);
  });
});

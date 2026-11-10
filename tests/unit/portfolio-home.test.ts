import { describe, expect, it } from "vitest";
import {
  approvedPortfolio,
  healthLine,
  healthSentence,
  oneThingToKnow,
  portfolioKpis,
  portfolioRows,
  priorityTab,
  suggestedDecisionProjects,
  suggestedDecisions,
  tabCounts,
  topRisks,
} from "@/lib/portfolio-home";
import type { CockpitProject } from "@/server/dashboard-cockpit";

// UX10 — Executive › Portfolio home rules. Synthetic fixtures only.
const NONE = { brd: "none", proto: "none", mvp1: "none", sit: "none", uat: "none", golive: "none" } as const;
const TZ = "Africa/Nairobi";
const NOW = new Date("2026-11-10T09:00:00Z"); // Tue 10 Nov, 12:00 Nairobi
const DAY = 86_400_000;

function project(id: string, over: Partial<CockpitProject> = {}): CockpitProject {
  return {
    id,
    code: id.toUpperCase(),
    name: `Project ${id}`,
    desc: "",
    category: "Approved",
    portfolioName: "Portfolio 1",
    pmId: "pm1",
    pmName: "user_004",
    pmIds: ["pm1"],
    status: "OnTrack",
    priority: "Med",
    reported: "G",
    reportedConfirmed: true,
    calculated: "G",
    signals: { status: "OnTrack" },
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

const RED = { id: "r1", title: "Vendor SLA unsigned", severity: "R" as const, owner: "user_007" };

const ps = [
  project("a", { priority: "High", reported: "R", redRisks: 1, risks: [RED], openBlockers: 2 }),
  project("b", { priority: "High", reported: "A" }),
  project("c", { priority: "New" }),
  project("d", { priority: "Low", reported: "N" }),
  project("e", { priority: "Strat" }),
  project("f", { priority: "Paused" }), // inactive → not in the approved portfolio
  project("g", { category: "Exploring", calculated: "R", freshnessDays: 9, openBlockers: 1 }), // not approved, still a suggested decision
  project("h", { status: "Completed" }),
  project("i", { status: "Cancelled", redRisks: 1, risks: [RED] }),
  project("j", { dispute: true, targetPassed: true, reported: "G", calculated: "A", freshnessDays: 30 }),
];

describe("approved portfolio and priority tabs", () => {
  it("is active, Approved-portfolio, not-paused projects", () => {
    expect(approvedPortfolio(ps).map((p) => p.id).sort()).toEqual(["a", "b", "c", "d", "e", "j"]);
  });

  it("maps priorities to tabs; New sits under Medium", () => {
    expect(["High", "Med", "New", "Low", "Strat"].map(priorityTab)).toEqual(["high", "medium", "medium", "low", "strategic"]);
  });

  it("tab counts add up to the Approved portfolio figure", () => {
    const rows = portfolioRows(ps, NOW, TZ);
    const counts = tabCounts(rows);
    expect(counts).toEqual({ high: 2, medium: 2, low: 1, strategic: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(portfolioKpis(ps).approved);
  });

  it("sorts worst reported health first", () => {
    expect(portfolioRows(ps, NOW, TZ).map((r) => r.id).slice(0, 2)).toEqual(["a", "b"]);
  });
});

describe("KPI figures", () => {
  it("counts approved by reported health, live, suggested decisions and blocked projects", () => {
    const k = portfolioKpis(ps);
    expect(k.approved).toBe(6);
    expect(k.byHealth).toEqual({ ok: 3, warn: 1, bad: 1, none: 1 });
    expect(healthLine(k.byHealth)).toBe("3 on track · 1 at risk · 1 off track · 1 not rated");
    expect(k.live).toBe(1);
    expect(k.liveNames).toEqual(["Project h"]);
    // a (red item), g (calculated red, stale 9d), j (dispute past target); i is cancelled.
    expect(k.decisions).toBe(3);
    expect(k.blocked).toBe(2);
    expect(k.openBlockers).toBe(3);
  });
});

describe("suggested decisions (the old exec.tsx rule)", () => {
  it("red item, OR dispute past target, OR calculated red and stale > 7 days — longest waiting first", () => {
    expect(suggestedDecisionProjects(ps).map((p) => p.id)).toEqual(["j", "g", "a"]);
    expect(suggestedDecisionProjects([project("x", { calculated: "R", freshnessDays: 7 })])).toEqual([]);
    expect(suggestedDecisionProjects([project("x", { dispute: true, targetPassed: false })])).toEqual([]);
  });

  it("says why, who and how long, and links to the right tab", () => {
    const [j, g, a] = suggestedDecisions(ps, 3);
    expect(j).toMatchObject({ why: "Past target; reported on track, calculates at risk", waiting: "30 days since an update", href: "/projects/j?tab=Delivery" });
    expect(g?.why).toBe("Calculates off track; no update for 9 days");
    expect(a).toMatchObject({ why: "Open red item: Vendor SLA unsigned", owner: "PM user_004", href: "/projects/a?tab=Register" });
    expect(suggestedDecisions(ps, 1)).toHaveLength(1);
  });
});

describe("the one thing to know", () => {
  const one = (over: Partial<CockpitProject>) => oneThingToKnow(project("x", over), NOW, TZ);

  it("applies the rules in order, first match wins", () => {
    expect(one({ risks: [RED], targetPassed: true }).text).toBe("Open red item: Vendor SLA unsigned");
    expect(one({ nextMilestone: { name: "SIT exit", dueDate: new Date("2026-11-06T08:00:00Z"), overdue: true }, targetPassed: true }).text).toBe("SIT exit overdue since 6 Nov");
    expect(one({ targetPassed: true, dueDate: new Date("2026-10-31T08:00:00Z"), openBlockers: 1 }).text).toBe("Past its target date (31 Oct)");
    expect(one({ openBlockers: 1, dispute: true }).text).toBe("1 open blocker");
    expect(one({ openBlockers: 3 }).text).toBe("3 open blockers");
    expect(one({ dispute: true, reported: "G", calculated: "R" }).text).toBe("Reported on track, calculates off track");
    expect(one({ freshnessDays: 21, reportedConfirmed: false }).text).toBe("No update for 21 days");
    expect(one({ freshnessDays: 999, reportedConfirmed: false }).text).toBe("No update yet");
    expect(one({ reportedConfirmed: false }).text).toBe("No check-in this week");
    expect(one({}).text).toBe("Confirmed on track");
    expect(one({ reported: "A" }).text).toBe("Confirmed at risk");
  });

  it("uses the tenant calendar: a milestone due today is not overdue", () => {
    const dueToday = new Date(NOW.getTime() + 6 * 3_600_000); // later today in Nairobi
    expect(one({ nextMilestone: { name: "Go-live", dueDate: dueToday, overdue: false } }).text).toBe("Confirmed on track");
    const yesterday = new Date(NOW.getTime() - DAY);
    expect(one({ nextMilestone: { name: "Go-live", dueDate: yesterday, overdue: true } }).tone).toBe("bad");
  });
});

describe("side panel and drawer", () => {
  it("top risks are the first red items across active projects", () => {
    expect(topRisks(ps, 2)).toEqual([{ key: "a-r1", title: "Vendor SLA unsigned", projectId: "a", projectName: "Project a", owner: "user_007" }]);
  });

  it("health sentence says where the status comes from and flags a dispute", () => {
    expect(healthSentence(project("x"))).toBe("Reported on track, confirmed by the PM this week.");
    expect(healthSentence(project("x", { reportedConfirmed: false, dispute: true, reported: "G", calculated: "A" }))).toBe(
      "Reported on track, from the project status (no confirmed check-in this week). QUBIT calculates at risk.",
    );
  });
});

// UX10 (D8b) — Portfolios lifecycle cards, the pure part: stage rule + Shelved overlay, card
// counts and the "five cards + Inactive = All" invariant, avg days in stage, the stuck rule,
// change-line gating at 28 days, and tab filtering.
import { describe, expect, it } from "vitest";
import {
  CARD_STAGES,
  avgDaysInStage,
  changeLine,
  changeLinesReady,
  daysInStage,
  inactiveLine,
  isIntakeIdea,
  isStuck,
  lifecycleCards,
  overlayShelved,
  parseTab,
  projectInitiativeStage,
  rowsForTab,
  sortInitiatives,
  stageCounts,
  tabCounts,
  type InitiativeRow,
  type InitiativeStage,
} from "@/lib/initiatives";

const TZ = "Africa/Nairobi"; // UTC+3
const NOW = new Date("2026-11-10T09:00:00Z"); // 12:00 in Nairobi
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const NO_HISTORY = { ready: false, weekAgo: null };

let seq = 0;
const row = (stage: InitiativeStage, over: Partial<InitiativeRow> = {}): InitiativeRow => ({
  kind: stage === "Intake" ? "idea" : "project",
  id: `id_${++seq}`,
  nextStep: null,
  code: stage === "Intake" ? null : `P${seq}`,
  name: `Initiative ${seq}`,
  portfolio: null,
  stage,
  inactiveReason: stage === "Inactive" ? "Paused" : null,
  health: stage === "Intake" || stage === "Live" || stage === "Inactive" ? null : "None",
  sponsor: "user_001",
  priority: stage === "Intake" ? null : "Med",
  stageEnteredAt: daysAgo(5),
  ...over,
});

describe("stage rule", () => {
  it("uses the lifecycle rule and reports why a project is inactive", () => {
    expect(projectInitiativeStage({ status: "Completed", pipelineStage: "Approved" })).toEqual({ stage: "Live", reason: null });
    expect(projectInitiativeStage({ status: "OnTrack", pipelineStage: "Evaluating" })).toEqual({ stage: "Evaluating", reason: null });
    expect(projectInitiativeStage({ status: "Cancelled", pipelineStage: "Approved" })).toEqual({ stage: "Inactive", reason: "Cancelled" });
    expect(projectInitiativeStage({ status: "OnTrack", pipelineStage: "Paused" })).toEqual({ stage: "Inactive", reason: "Paused" });
    expect(projectInitiativeStage({ status: "OnTrack", pipelineStage: "Approved", priority: "Paused" })).toEqual({ stage: "Inactive", reason: "Paused" });
  });

  it("a project in a Shelved portfolio is Inactive (Shelved) unless Live or already inactive", () => {
    expect(projectInitiativeStage({ status: "OnTrack", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toEqual({ stage: "Inactive", reason: "Shelved" });
    expect(projectInitiativeStage({ status: "Completed", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toEqual({ stage: "Live", reason: null });
    expect(projectInitiativeStage({ status: "Cancelled", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toEqual({ stage: "Inactive", reason: "Cancelled" });
    expect(overlayShelved("Exploring", "Shelved")).toBe("Inactive");
    expect(overlayShelved("Exploring", "Approved")).toBe("Exploring");
  });

  it("only New and Reviewing ideas are Intake", () => {
    expect(["New", "Reviewing", "Accepted", "Parked", "Merged"].filter(isIntakeIdea)).toEqual(["New", "Reviewing"]);
  });
});

describe("cards", () => {
  const rows = [
    row("Intake"),
    row("Intake"),
    row("Exploring"),
    row("Evaluating"),
    row("Approved", { health: "Green" }),
    row("Approved", { health: "Green" }),
    row("Approved", { health: "Amber" }),
    row("Approved", { health: "Red" }),
    row("Approved", { health: "None" }),
    row("Live", { stageEnteredAt: daysAgo(10) }),
    row("Live", { stageEnteredAt: daysAgo(200) }),
    row("Inactive"),
    row("Inactive", { inactiveReason: "Shelved" }),
    row("Inactive", { inactiveReason: "Cancelled" }),
  ];

  it("five cards plus Inactive always add up to All", () => {
    const cards = lifecycleCards(rows, NOW, TZ, NO_HISTORY);
    expect(cards.map((c) => c.stage)).toEqual([...CARD_STAGES]);
    const sum = cards.reduce((a, c) => a + c.count, 0) + rowsForTab(rows, "inactive").length;
    expect(sum).toBe(rows.length);
    expect(sum).toBe(tabCounts(rows).all);
    expect(stageCounts(rows)).toEqual({ Intake: 2, Exploring: 1, Evaluating: 1, Approved: 5, Live: 2, Inactive: 3 });
  });

  it("Approved's context is its health in status words; Live counts recent go-lives", () => {
    const cards = lifecycleCards(rows, NOW, TZ, NO_HISTORY);
    expect(cards.find((c) => c.stage === "Approved")?.context).toBe("2 on track · 1 at risk · 1 off track");
    expect(cards.find((c) => c.stage === "Live")?.context).toBe("1 went live in the last 90 days");
  });

  it("pipeline cards show the average days in stage, amber with a stuck count when one is stuck", () => {
    const cards = lifecycleCards([row("Exploring", { stageEnteredAt: daysAgo(10) }), row("Exploring", { stageEnteredAt: daysAgo(40) }), row("Evaluating")], NOW, TZ, NO_HISTORY);
    const exp = cards.find((c) => c.stage === "Exploring");
    expect(exp).toMatchObject({ count: 2, context: "Avg. 25 days · 1 stuck", contextWarn: true });
    expect(cards.find((c) => c.stage === "Evaluating")).toMatchObject({ context: "Avg. 5 days in stage", contextWarn: false });
    expect(cards.find((c) => c.stage === "Intake")).toMatchObject({ count: 0, context: "Nothing in this stage" });
  });

  it("unknown entry dates are excluded from the average", () => {
    expect(avgDaysInStage([{ stageEnteredAt: daysAgo(4) }, { stageEnteredAt: null }, { stageEnteredAt: daysAgo(8) }], NOW, TZ)).toBe(6);
    expect(avgDaysInStage([{ stageEnteredAt: null }], NOW, TZ)).toBeNull();
    const cards = lifecycleCards([row("Evaluating", { stageEnteredAt: null })], NOW, TZ, NO_HISTORY);
    expect(cards.find((c) => c.stage === "Evaluating")?.context).toBe("Days in stage not known yet");
  });

  it("the change line is omitted without history and shown in the card once ready", () => {
    expect(lifecycleCards(rows, NOW, TZ, NO_HISTORY).every((c) => c.change === null)).toBe(true);
    const weekAgo = { Intake: 0, Exploring: 1, Evaluating: 2, Approved: 5, Live: 2 };
    const cards = lifecycleCards(rows, NOW, TZ, { ready: true, weekAgo });
    expect(cards.map((c) => c.change)).toEqual(["↑ 2 this week", "No change this week", "↓ 1 this week", "No change this week", "No change this week"]);
  });

  it("the inactive line", () => {
    expect(inactiveLine(7)).toBe("7 paused, shelved or cancelled");
    expect(inactiveLine(0)).toBe("Nothing paused, shelved or cancelled");
  });
});

describe("days in stage and stuck", () => {
  it("counts tenant-local calendar days", () => {
    // 22:00 UTC on the 9th is 01:00 on the 10th in Nairobi — same day as NOW.
    expect(daysInStage("2026-11-09T22:00:00Z", NOW, TZ)).toBe(0);
    expect(daysInStage("2026-11-09T20:00:00Z", NOW, TZ)).toBe(1);
    expect(daysInStage(null, NOW, TZ)).toBeNull();
  });

  it("stuck = more than 30 days in a pipeline stage; never for unknown dates, Approved, Live or Inactive", () => {
    expect(isStuck(row("Exploring", { stageEnteredAt: daysAgo(31) }), NOW, TZ)).toBe(true);
    expect(isStuck(row("Intake", { stageEnteredAt: daysAgo(45) }), NOW, TZ)).toBe(true);
    expect(isStuck(row("Evaluating", { stageEnteredAt: daysAgo(30) }), NOW, TZ)).toBe(false);
    expect(isStuck(row("Evaluating", { stageEnteredAt: null }), NOW, TZ)).toBe(false);
    expect(isStuck(row("Approved", { stageEnteredAt: daysAgo(90) }), NOW, TZ)).toBe(false);
    expect(isStuck(row("Live", { stageEnteredAt: daysAgo(90) }), NOW, TZ)).toBe(false);
    expect(isStuck(row("Inactive", { stageEnteredAt: daysAgo(90) }), NOW, TZ)).toBe(false);
  });
});

describe("change lines", () => {
  it("stay hidden until stage snapshots cover 28 days", () => {
    expect(changeLinesReady(null, "2026-11-10")).toBe(false);
    expect(changeLinesReady("2026-10-14", "2026-11-10")).toBe(false); // 27 days
    expect(changeLinesReady("2026-10-13", "2026-11-10")).toBe(true); // 28 days
    expect(changeLinesReady("2026-09-01", "2026-11-10")).toBe(true);
  });

  it("words", () => {
    expect(changeLine(5, 3)).toBe("↑ 2 this week");
    expect(changeLine(3, 5)).toBe("↓ 2 this week");
    expect(changeLine(4, 4)).toBe("No change this week");
  });
});

describe("tabs", () => {
  const rows = [row("Intake"), row("Exploring"), row("Evaluating"), row("Approved"), row("Live"), row("Inactive")];

  it("Pipeline = Intake + Exploring + Evaluating; Delivery = Approved + Live; Inactive alone", () => {
    expect(rowsForTab(rows, "pipeline").map((r) => r.stage)).toEqual(["Intake", "Exploring", "Evaluating"]);
    expect(rowsForTab(rows, "delivery").map((r) => r.stage)).toEqual(["Approved", "Live"]);
    expect(rowsForTab(rows, "inactive").map((r) => r.stage)).toEqual(["Inactive"]);
    expect(rowsForTab(rows, "all")).toHaveLength(6);
    const c = tabCounts(rows);
    expect(c.pipeline + c.delivery + c.inactive).toBe(c.all);
  });

  it("an odd tab in the URL reads as All", () => {
    expect(parseTab("inactive")).toBe("inactive");
    expect(parseTab("nonsense")).toBe("all");
    expect(parseTab(null)).toBe("all");
  });

  it("sorts by stage, then longest in stage, then name", () => {
    const a = row("Exploring", { name: "B", stageEnteredAt: daysAgo(3) });
    const b = row("Exploring", { name: "A", stageEnteredAt: daysAgo(20) });
    const c = row("Intake", { name: "Z" });
    const d = row("Exploring", { name: "C", stageEnteredAt: null });
    expect(sortInitiatives([a, d, b, c], NOW, TZ).map((r) => r.name)).toEqual(["Z", "A", "B", "C"]);
  });
});

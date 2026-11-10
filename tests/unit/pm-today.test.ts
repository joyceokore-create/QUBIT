import { describe, expect, it } from "vitest";
import { buildTodo, daysLate, itemsForTab, pmKpis, todoTabs, updatesLate, type PmToday, type PmTodayProject } from "@/lib/pm-today";
import { derivedRagReasons } from "@/server/health";

// UX7 — PM Today ordering, tabs, figures and the "why it calculates" reasons.
const TZ = "Africa/Nairobi";
const WED = new Date("2026-11-11T06:00:00Z"); // Wed 09:00 Nairobi
const FRI_EVE = new Date("2026-11-13T14:30:00Z"); // Fri 17:30 Nairobi

const project = (id: string, over: Partial<PmTodayProject> = {}): PmTodayProject => ({
  id,
  name: `Project ${id}`,
  code: id.toUpperCase(),
  reported: "G",
  calculated: "G",
  dispute: false,
  reasons: [],
  pct: 50,
  nextMilestone: null,
  update: "sent",
  gates: [],
  redItems: [],
  overdueTasks: 0,
  ...over,
});

const today = (over: Partial<PmToday> = {}): PmToday => ({
  timeZone: TZ,
  projects: [],
  overdueMilestones: [],
  milestonesNext7: 0,
  blockers: [],
  clashes: [],
  ...over,
});

describe("Friday 17:00 deadline", () => {
  it("is late from Friday 17:00 to Sunday, tenant time", () => {
    expect(updatesLate(WED, TZ)).toBe(false);
    expect(updatesLate(new Date("2026-11-13T13:30:00Z"), TZ)).toBe(false); // Fri 16:30
    expect(updatesLate(FRI_EVE, TZ)).toBe(true);
    expect(updatesLate(new Date("2026-11-15T10:00:00Z"), TZ)).toBe(true); // Sun
  });

  it("counts days late on the tenant calendar", () => {
    expect(daysLate(new Date("2026-11-08T06:00:00Z"), WED, TZ)).toBe(3);
  });
});

describe("the To do list", () => {
  const t = today({
    projects: [
      project("p1", { update: "draft", dispute: true, reported: "G", calculated: "A", gates: [{ key: "sit", label: "SIT", state: "blocked" }], redItems: [{ title: "Vendor SLA unsigned", owner: "—" }] }),
      project("p2", { update: "sent" }),
    ],
    overdueMilestones: [
      { id: "m1", name: "Dry run", dueDate: new Date("2026-11-10T06:00:00Z"), projectId: "p1", projectName: "Project p1" },
      { id: "m2", name: "Cutover", dueDate: new Date("2026-11-04T06:00:00Z"), projectId: "p1", projectName: "Project p1" },
    ],
    blockers: [{ id: "b1", description: "Waiting on data", since: new Date("2026-11-09T06:00:00Z"), projectId: "p1", projectName: "Project p1", taskId: "t1", taskTitle: "Prepare SIT data", raisedBy: "user_006", unblocker: null }],
  });

  it("orders most urgent first: overdue (latest-slipped first) → blockers → updates → gates → disputes → red", () => {
    expect(buildTodo(t, WED).map((i) => i.id)).toEqual(["ms-m2", "ms-m1", "bl-b1", "up-p1", "gt-p1-sit", "dp-p1", "rk-p1-0"]);
  });

  it("puts an unsent update ahead of blockers once it's late", () => {
    const ids = buildTodo(t, FRI_EVE).map((i) => i.id);
    expect(ids.indexOf("up-p1")).toBeLessThan(ids.indexOf("bl-b1"));
    expect(buildTodo(t, FRI_EVE).find((i) => i.id === "up-p1")?.chip).toEqual({ tone: "bad", label: "Late" });
  });

  it("words items plainly and points each at its action", () => {
    const items = buildTodo(t, WED);
    expect(items.find((i) => i.id === "dp-p1")?.title).toBe("Status dispute: you report On track, QUBIT calculates At risk");
    expect(items.find((i) => i.id === "ms-m2")?.action).toEqual({ kind: "milestone", label: "Update", milestoneId: "m2" });
    expect(items.find((i) => i.id === "up-p1")?.action).toMatchObject({ kind: "link", href: "/projects/p1?tab=This%20week" });
  });

  it("counts tabs and filters by kind", () => {
    const items = buildTodo(t, WED);
    expect(todoTabs(items).map((x) => [x.key, x.count])).toEqual([
      ["all", 7],
      ["overdue", 2],
      ["updates", 1],
      ["gates", 1],
      ["disputes", 1],
      ["risks", 1],
      ["blockers", 1],
    ]);
    expect(itemsForTab(items, "gates").map((i) => i.id)).toEqual(["gt-p1-sit"]);
  });

  it("works out the KPI figures", () => {
    expect(pmKpis(t)).toEqual({ projects: 2, byHealth: { ok: 2, warn: 0, bad: 0, none: 0 }, dueNext7: 0, overdueMilestones: 2, overdueTasks: 0, updatesSent: 1 });
  });
});

describe("why QUBIT calculates a status", () => {
  it("lists the same signals derivedRag uses, in words", () => {
    expect(derivedRagReasons({ status: "AtRisk", gatesBlocked: 1, openBlockers: 2, overdueTasks: 1, milestonesSlipped: 1 })).toEqual([
      "The project's status is At risk",
      "1 gate is blocked",
      "2 open blockers",
      "1 task is overdue",
      "1 milestone is past its date",
    ]);
    expect(derivedRagReasons({ status: "OnTrack" })).toEqual([]);
    expect(derivedRagReasons({ status: "Completed", openBlockers: 3 })).toEqual([]);
  });
});

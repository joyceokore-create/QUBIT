import { describe, expect, it } from "vitest";
import { buildQueue, coverageList, qhKpis, type QhData } from "@/lib/quality-home";

// UX9 — Quality home queue and figures.
const TZ = "Africa/Nairobi";
const WED = new Date("2026-11-11T06:00:00Z");

const data: QhData = {
  timeZone: TZ,
  projects: [
    { id: "p1", name: "Project p1", pmName: "user_004", testingGates: [{ key: "uat", label: "UAT", state: "prog" }], inTesting: true, coveragePct: 94, criticalOpen: 2, overdueTests: 1 },
    { id: "p2", name: "Project p2", pmName: null, testingGates: [{ key: "sit", label: "SIT", state: "prog" }], inTesting: true, coveragePct: 45, criticalOpen: 0, overdueTests: 0 },
    { id: "p3", name: "Project p3", pmName: null, testingGates: [], inTesting: false, coveragePct: null, criticalOpen: 0, overdueTests: 0 },
  ],
  critical: [
    { id: "b1", kind: "bug", title: "Session drops", projectId: "p1", projectName: "Project p1", owner: null, openedAt: new Date("2026-11-09T06:00:00Z") },
    { id: "i1", kind: "issue", title: "Vendor data missing", projectId: "p1", projectName: "Project p1", owner: "user_005", openedAt: new Date("2026-11-11T05:00:00Z") },
  ],
  unassigned: [{ id: "t1", title: "Regression pack", projectId: "p2", projectName: "Project p2", dueDate: null, assignee: null }],
  overdue: [{ id: "t2", title: "UAT cases", projectId: "p1", projectName: "Project p1", dueDate: new Date("2026-11-08T06:00:00Z"), assignee: "user_006" }],
};

describe("quality queue", () => {
  const items = buildQueue(data, WED);

  it("holds a testing gate with open critical issues as 'Blocked by N'", () => {
    expect(items.find((i) => i.id === "gate-p1-uat")).toMatchObject({ chip: { tone: "warn", label: "Blocked by 2" }, sub: "2 critical issues open · 94% of requirements have tests" });
    expect(items.find((i) => i.id === "gate-p2-sit")?.chip).toEqual({ tone: "ok", label: "No blockers" });
  });

  it("links critical bugs to the board and issues to the Register, with their age", () => {
    expect(items.find((i) => i.id === "crit-bug-b1")).toMatchObject({ href: "/projects/p1?tab=Board&task=b1", when: "2 days", sub: "Project p1 · Bug · no owner" });
    expect(items.find((i) => i.id === "crit-issue-i1")).toMatchObject({ href: "/projects/p1?tab=Register", when: "today" });
    expect(items.find((i) => i.id === "od-t2")?.chip.label).toBe("3 days late");
  });
});

describe("figures", () => {
  it("counts testing, gates held, critical and overdue", () => {
    expect(qhKpis(data)).toEqual({ inTesting: 2, testingGates: 2, gatesBlocked: 1, criticalOpen: 2, criticalProjects: 1, overdueTests: 1, overdueProjects: 1 });
  });
  it("lists coverage lowest first and skips projects without requirements", () => {
    expect(coverageList(data).map((c) => c.pct)).toEqual([45, 94]);
  });
});

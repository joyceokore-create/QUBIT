import { describe, expect, it } from "vitest";
import { buildQueue, coverageList, qhKpis, type QhData } from "@/lib/quality-home";
import type { GateQueueItem } from "@/lib/gate-approval";

/** A synthetic gate in the sign-off queue (WS1). */
function gateItem(o: Partial<GateQueueItem> = {}): GateQueueItem {
  return {
    statusId: "s", projectId: "p1", projectCode: "P1", projectName: "Project p1", checkpointId: "c", gateName: "UAT", testing: true,
    orgUnitId: null, marketName: null, moduleName: null, approval: "submitted", state: "InProgress", submittedAt: "2026-11-09T06:00:00Z",
    submittedById: "u_pm", submittedByName: "user_004", pmName: "user_004", source: null, decidedAt: null, decidedByName: null, decisionNote: null, canDecide: true,
    ...o,
  };
}
// WS1: the Testing Gates tab lists REAL testing gates submitted for sign-off.
const gates = [
  gateItem({ statusId: "g1" }),
  gateItem({ statusId: "g2", projectId: "p2", projectName: "Project p2", gateName: "SIT", submittedAt: "2026-11-11T05:00:00Z" }),
  gateItem({ statusId: "g3", testing: false, gateName: "Go-Live" }), // not a testing gate — not listed
  gateItem({ statusId: "g4", approval: "returned" }), // not waiting — not listed
];

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
  const items = buildQueue(data, WED, gates);

  it("holds a submitted testing gate with open critical issues as 'Blocked by N'; a clean one reads Ready", () => {
    expect(items.find((i) => i.id === "gate-g1")).toMatchObject({
      title: "Project p1 · UAT",
      chip: { tone: "warn", label: "Blocked by 2" },
      sub: "Pass rate not tracked · 2 critical issues open · 94% of requirements have tests",
      when: "2d",
      gate: { projectId: "p1", statusId: "g1" },
    });
    expect(items.find((i) => i.id === "gate-g2")).toMatchObject({ chip: { tone: "ok", label: "Ready" }, when: "today" });
    expect(items.filter((i) => i.tab === "gates").map((i) => i.id)).toEqual(["gate-g1", "gate-g2"]);
  });

  it("lists no testing gates from project state without a submission", () => {
    expect(buildQueue(data, WED).filter((i) => i.tab === "gates")).toEqual([]);
  });

  it("links critical bugs to the board and issues to the Register, with their age", () => {
    expect(items.find((i) => i.id === "crit-bug-b1")).toMatchObject({ href: "/projects/p1?tab=Board&task=b1", when: "2 days", sub: "Project p1 · Bug · no owner" });
    expect(items.find((i) => i.id === "crit-issue-i1")).toMatchObject({ href: "/projects/p1?tab=Register", when: "today" });
    expect(items.find((i) => i.id === "od-t2")?.chip.label).toBe("3 days late");
  });
});

describe("figures", () => {
  it("counts testing, gates held, critical and overdue", () => {
    expect(qhKpis(data, gates)).toEqual({ inTesting: 2, testingGates: 2, gatesBlocked: 1, criticalOpen: 2, criticalProjects: 1, overdueTests: 1, overdueProjects: 1 });
    expect(qhKpis(data).testingGates).toBe(0);
  });
  it("lists coverage lowest first and skips projects without requirements", () => {
    expect(coverageList(data).map((c) => c.pct)).toEqual([45, 94]);
  });
});

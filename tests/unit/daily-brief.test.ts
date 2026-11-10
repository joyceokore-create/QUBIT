import { describe, expect, it } from "vitest";
import { buildBrief, daysBetween, nameList, rankBrief, type BriefInput, type BriefItem } from "@/lib/daily-brief";
import type { CockpitProject } from "@/server/dashboard-cockpit";

// UX4 — Daily Brief rules (UX plan D4/D4a). Synthetic projects and people only.

const TZ = "Africa/Nairobi";
// Wednesday 11 Nov 2026, 09:00 in Nairobi (06:00 UTC).
const WED = new Date("2026-11-11T06:00:00Z");
// Friday 13 Nov 2026, 09:00 in Nairobi.
const FRI = new Date("2026-11-13T06:00:00Z");

const NONE = { brd: "none", proto: "none", mvp1: "none", sit: "none", uat: "none", golive: "none" } as const;

function project(over: Partial<CockpitProject> & { id: string }): CockpitProject {
  return {
    code: over.id.toUpperCase(),
    name: `Project ${over.id}`,
    desc: "",
    category: "Approved",
    portfolioName: null,
    pmId: "user_004",
    pmName: "user_004",
    pmIds: ["user_004"],
    status: "InProgress",
    priority: "Med",
    reported: "G",
    reportedConfirmed: false,
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
  };
}

const input = (over: Partial<BriefInput>): BriefInput => ({
  role: "ProjectManager",
  viewerId: "user_004",
  now: WED,
  timeZone: TZ,
  projects: [],
  extras: {},
  ...over,
});

const item = (id: string, group: BriefItem["group"], weight: number): BriefItem => ({
  id,
  group,
  weight,
  emphasis: id,
  detail: "",
  action: { label: "Open", href: "/" },
});

describe("ranking (D4a)", () => {
  it("orders now → wait → fyi, heavier first inside a group", () => {
    const ranked = rankBrief([item("f", "fyi", 9), item("w1", "wait", 1), item("n1", "now", 1), item("w2", "wait", 5), item("n2", "now", 7)]);
    expect(ranked.map((i) => i.id)).toEqual(["n2", "n1", "w2", "w1", "f"]);
  });

  it("an empty Brief has no items (the card shows the one quiet line)", () => {
    expect(buildBrief(input({})).items).toEqual([]);
  });
});

describe("helpers", () => {
  it("lists names plainly and cuts long lists", () => {
    expect(nameList(["A"])).toBe("A");
    expect(nameList(["A", "B"])).toBe("A and B");
    expect(nameList(["A", "B", "C"])).toBe("A, B and C");
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });

  it("counts days on the tenant's calendar, not UTC", () => {
    // 22:30 UTC on the 10th is already the 11th in Nairobi.
    expect(daysBetween(new Date("2026-11-10T22:30:00Z"), WED, TZ)).toBe(0);
    expect(daysBetween(new Date("2026-11-09T06:00:00Z"), WED, TZ)).toBe(2);
  });
});

describe("Project Manager", () => {
  it("flags an overdue milestone on the viewer's own project only", () => {
    const due = new Date("2026-11-09T06:00:00Z");
    const brief = buildBrief(
      input({
        projects: [
          project({ id: "p1", nextMilestone: { name: "MVP1", dueDate: due, overdue: true } }),
          project({ id: "p2", pmIds: ["user_099"], nextMilestone: { name: "SIT", dueDate: due, overdue: true } }),
        ],
      }),
    );
    expect(brief.items).toHaveLength(1);
    expect(brief.items[0]).toMatchObject({ group: "now", emphasis: "Project p1 has a milestone overdue." });
    expect(brief.items[0].detail).toContain("MVP1 was due 9 Nov");
    expect(brief.items[0].action.href).toBe("/projects/p1?tab=Delivery");
  });

  it("a milestone due today (tenant time) isn't overdue yet", () => {
    const dueToday = new Date("2026-11-10T22:00:00Z"); // 01:00 on the 11th in Nairobi
    const brief = buildBrief(input({ projects: [project({ id: "p1", nextMilestone: { name: "MVP1", dueDate: dueToday, overdue: true } })] }));
    expect(brief.items).toEqual([]);
  });

  it("words a dispute with the status names and ranks it after overdue work", () => {
    const brief = buildBrief(
      input({
        projects: [
          project({ id: "p1", reported: "G", calculated: "A", dispute: true }),
          project({ id: "p2", redRisks: 1, risks: [{ id: "r1", title: "Vendor SLA unsigned", severity: "R", owner: "user_004" }] }),
        ],
      }),
    );
    expect(brief.items.map((i) => i.emphasis)).toEqual(["Project p2 has an open red risk.", "Project p1 is reported Green but calculates Amber."]);
    expect(brief.items[0].detail).toMatch(/^Vendor SLA unsigned\. /);
  });

  it("unsent weekly updates are a heads-up midweek and action-now from Friday", () => {
    const projects = [project({ id: "p1" }), project({ id: "p2" })];
    const extras = { checkInsSent: ["p2"] };
    const wed = buildBrief(input({ projects, extras })).items[0];
    expect(wed).toMatchObject({ group: "fyi", emphasis: "1 weekly update is due Friday at 17:00." });
    const fri = buildBrief(input({ projects, extras, now: FRI })).items[0];
    expect(fri).toMatchObject({ group: "now", emphasis: "1 weekly update hasn't been sent." });
  });

  it("says nothing about updates when the sent list wasn't read", () => {
    expect(buildBrief(input({ projects: [project({ id: "p1" })] })).items).toEqual([]);
  });
});

describe("Member", () => {
  const task = (id: string, due: string | null, extra: Partial<{ blockedSince: Date; blockerText: string }> = {}) => ({
    id,
    title: `Task ${id}`,
    projectId: "p1",
    projectName: "Project p1",
    dueDate: due ? new Date(due) : null,
    blockedSince: extra.blockedSince ?? null,
    blockerText: extra.blockerText ?? null,
  });

  it("names a single overdue task and links to it on the board", () => {
    const brief = buildBrief(input({ role: "Member", viewerId: "user_006", extras: { myTasks: [task("t1", "2026-11-10T06:00:00Z")] } }));
    expect(brief.items[0]).toMatchObject({ group: "now", emphasis: "One task is overdue: Task t1." });
    expect(brief.items[0].action.href).toBe("/projects/p1?tab=Board&task=t1");
  });

  it("groups due today, due tomorrow and blocked tasks", () => {
    const brief = buildBrief(
      input({
        role: "Member",
        viewerId: "user_006",
        extras: {
          myTasks: [
            task("t1", "2026-11-11T12:00:00Z"),
            task("t2", "2026-11-12T12:00:00Z"),
            task("t3", "2026-11-12T13:00:00Z"),
            task("t4", null, { blockedSince: new Date("2026-11-09T06:00:00Z"), blockerText: "Waiting on vendor test data." }),
          ],
        },
      }),
    );
    expect(brief.items.map((i) => [i.group, i.emphasis])).toEqual([
      ["wait", "1 task is due today."],
      ["wait", "Task t4 has been blocked since 9 Nov."],
      ["fyi", "2 tasks are due tomorrow."],
    ]);
    expect(brief.items[1].detail).toBe("Waiting on vendor test data. Your PM can see this blocker.");
  });
});

describe("Head of Projects", () => {
  it("covers blocked gates, red, disputes, stale updates and the triage queue", () => {
    const brief = buildBrief(
      input({
        role: "HeadOfProjects",
        viewerId: "user_003",
        projects: [
          project({ id: "p1", gates: { ...NONE, sit: "block" } }),
          project({ id: "p2", calculated: "R" }),
          project({ id: "p3", dispute: true, reported: "G", calculated: "A" }),
          project({ id: "p4", freshnessDays: 20 }),
          project({ id: "p5", status: "Completed", calculated: "R" }),
        ],
        extras: { ideasNew: { count: 3, oldestAt: new Date("2026-11-05T06:00:00Z") } },
      }),
    );
    expect(brief.items.map((i) => i.emphasis)).toEqual([
      "Project p1's SIT gate is blocked.",
      "1 project calculates Red.",
      "1 project is reported greener than it calculates.",
      "1 status update is older than 14 days.",
      "3 ideas are waiting for triage.",
    ]);
    expect(brief.items[4].detail).toBe("The oldest was submitted 6 days ago.");
  });

  it("matches the 'To escalate upward' figure: a red risk, or past target and not Green", () => {
    const brief = buildBrief(
      input({
        role: "HeadOfProjects",
        projects: [project({ id: "p1", redRisks: 1 }), project({ id: "p2", targetPassed: true, calculated: "A" }), project({ id: "p3", targetPassed: true })],
      }),
    );
    expect(brief.items[0]).toMatchObject({ group: "now", emphasis: "2 projects need escalating upward." });
    expect(brief.items[0].detail).toBe("Project p1 and Project p2: each has a red risk, or is past target and not Green.");
  });

  it("never mentions the triage queue when it wasn't read (no permission)", () => {
    const brief = buildBrief(input({ role: "HeadOfProjects", projects: [] }));
    expect(brief.items).toEqual([]);
  });
});

describe("Head of QA", () => {
  it("blocks a testing gate on open critical issues and flags thin coverage before SIT", () => {
    const brief = buildBrief(
      input({
        role: "HeadOfQA",
        projects: [
          project({ id: "p1", currentGate: "UAT" }),
          project({ id: "p2", currentGate: "MVP1", coveragePct: 45 }),
          project({ id: "p3", currentGate: "SIT", coveragePct: 30 }),
        ],
        extras: { criticalByProject: { p1: 2 } },
      }),
    );
    expect(brief.items.map((i) => [i.group, i.emphasis])).toEqual([
      ["now", "Project p1 can't exit UAT yet."],
      ["wait", "2 critical issues are open."],
      ["fyi", "Project p2 has tests for only 45% of its requirements."],
    ]);
  });
});

describe("Executive", () => {
  it("counts approved initiatives at risk, hidden health and live solutions", () => {
    const brief = buildBrief(
      input({
        role: "Executive",
        projects: [
          project({ id: "p1", calculated: "R" }),
          project({ id: "p2", calculated: "R", category: "Exploring" }),
          project({ id: "p3", dispute: true }),
          project({ id: "p4", status: "Completed" }),
        ],
      }),
    );
    expect(brief.items.map((i) => i.emphasis)).toEqual([
      "1 approved initiative is at risk.",
      "Reported status hides 1 project in worse health.",
      "1 solution is live in production.",
    ]);
  });
});

describe("Executive decisions", () => {
  it("matches the 'Decisions needing Group action' figure and says it's suggested", () => {
    const brief = buildBrief(input({ role: "Executive", projects: [project({ id: "p1", calculated: "R", freshnessDays: 10, category: "Exploring" })] }));
    expect(brief.items[0]).toMatchObject({ group: "now", emphasis: "1 project may need a Group decision." });
    expect(brief.items[0].detail).toBe("Project p1. Suggested from project signals.");
  });
});

describe("Super Admin", () => {
  it("escalates access requests once the oldest is two days old", () => {
    const fresh = buildBrief(input({ role: "PlatformSuperAdmin", extras: { accessRequests: { count: 2, oldestAt: WED } } }));
    expect(fresh.items[0]).toMatchObject({ group: "wait", emphasis: "2 access requests are waiting.", detail: "The oldest is from today." });
    const old = buildBrief(input({ role: "PlatformSuperAdmin", extras: { accessRequests: { count: 1, oldestAt: new Date("2026-11-08T06:00:00Z") } } }));
    expect(old.items[0]).toMatchObject({ group: "now", emphasis: "1 access request is waiting.", detail: "It is 3 days old." });
  });

  it("lists accounts without MFA and expired invites; zero counts say nothing", () => {
    const brief = buildBrief(
      input({ role: "PlatformSuperAdmin", extras: { accessRequests: { count: 0, oldestAt: null }, usersWithoutMfa: 4, expiredInvites: 0 } }),
    );
    expect(brief.items.map((i) => i.emphasis)).toEqual(["4 active users still have no MFA."]);
  });
});

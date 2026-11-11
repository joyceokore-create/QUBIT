import { describe, expect, it } from "vitest";
import { dueGroupOf, groupByDue, myKpis, myTabs, taskStatusWord, tasksForTab, weekEndKey, type MyTask } from "@/lib/my-work";

// UX6 — My work grouping, tabs and KPI figures, on the tenant's calendar.
const TZ = "Africa/Nairobi";
const WED = new Date("2026-11-11T06:00:00Z"); // Wed 11 Nov, 09:00 Nairobi

const task = (id: string, due: string | null, extra: Partial<MyTask> = {}): MyTask => ({
  id,
  title: `Task ${id}`,
  key: null,
  projectId: "p1",
  projectName: "Project p1",
  status: "NotStarted",
  type: "Feature",
  priority: "Medium",
  severity: null,
  dueDate: due ? new Date(due) : null,
  estimate: null,
  description: null,
  milestone: null,
  externalUrl: null,
  role: "Developer",
  raisedByMe: false,
  blocker: null,
  ...extra,
});

describe("due groups", () => {
  it("ends the week on the tenant-local Sunday", () => {
    expect(weekEndKey(WED, TZ)).toBe("2026-11-15");
    expect(weekEndKey(new Date("2026-11-15T20:00:00Z"), TZ)).toBe("2026-11-15"); // 23:00 Sun in Nairobi: still this week
    expect(weekEndKey(new Date("2026-11-15T21:30:00Z"), TZ)).toBe("2026-11-22"); // 00:30 Mon 16 Nov in Nairobi
  });

  it("puts each task in Overdue, Today, This week, Later or No due date", () => {
    expect(dueGroupOf(new Date("2026-11-10T06:00:00Z"), WED, TZ)).toBe("overdue");
    expect(dueGroupOf(new Date("2026-11-10T22:00:00Z"), WED, TZ)).toBe("today"); // 01:00 on the 11th in Nairobi
    expect(dueGroupOf(new Date("2026-11-15T12:00:00Z"), WED, TZ)).toBe("week");
    expect(dueGroupOf(new Date("2026-11-16T12:00:00Z"), WED, TZ)).toBe("later");
    expect(dueGroupOf(null, WED, TZ)).toBe("none");
  });

  it("drops empty groups and keeps the order", () => {
    const groups = groupByDue([task("a", null), task("b", "2026-11-09T06:00:00Z"), task("c", "2026-11-13T06:00:00Z")], WED, TZ);
    expect(groups.map((g) => g.group)).toEqual(["overdue", "week", "none"]);
  });
});

describe("tabs and figures", () => {
  const blocked = { id: "b1", description: "Waiting on synthetic data", since: new Date("2026-11-09T06:00:00Z"), unblocker: null };
  const work = {
    tasks: [task("a", "2026-11-09T06:00:00Z"), task("b", "2026-11-11T10:00:00Z"), task("c", "2026-11-14T06:00:00Z", { blocker: blocked }), task("d", null)],
    raised: [],
    projects: [{ id: "p1", code: "P1", name: "Project p1", role: "Developer", openTasks: 4, health: null, pmNames: [], people: [] }],
    done: { thisWeek: 2, lastWeek: 5 },
  };

  it("counts each tab; Issues I raised only appears for QA or when there are some", () => {
    expect(myTabs(work, WED, TZ).map((t) => [t.key, t.count])).toEqual([
      ["all", 4],
      ["overdue", 1],
      ["today", 1],
      ["blocked", 1],
    ]);
    const qa = { ...work, projects: [{ ...work.projects[0], role: "QA" }] };
    expect(myTabs(qa, WED, TZ).at(-1)).toEqual({ key: "raised", label: "Issues I Raised", count: 0 });
    expect(tasksForTab(work, "blocked", WED, TZ).map((t) => t.id)).toEqual(["c"]);
  });

  it("works out the three KPI figures", () => {
    expect(myKpis(work, WED, TZ)).toEqual({
      dueThisWeek: 2,
      dueToday: 1,
      overdue: 1,
      blocked: 1,
      firstBlocker: "Waiting on synthetic data",
      doneThisWeek: 2,
      doneChange: -3,
    });
  });

  it("words task statuses plainly, and blocked wins", () => {
    expect(taskStatusWord("NotStarted", false)).toBe("To do");
    expect(taskStatusWord("InProgress", true)).toBe("Blocked");
    expect(taskStatusWord("InQA", false)).toBe("In QA");
    expect(taskStatusWord("SomethingNew", false)).toBe("Something New");
  });
});

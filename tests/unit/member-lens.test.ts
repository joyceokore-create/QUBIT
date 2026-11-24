import { describe, expect, it } from "vitest";
import {
  chooseMemberLens,
  daysUntil,
  goLiveChip,
  GO_LIVE_NAME,
  handoverChip,
  isReadyToRetest,
  issueChip,
  lensView,
  sortGoLives,
  type LensGoLive,
  type LensWork,
} from "@/lib/member-lens";
import { toTitleCase } from "@/lib/title-case";
import type { MyTask } from "@/lib/my-work";

// Tier 3 — Member lenses on My Work: which lens, the retest rule and each lens's tabs/rows.
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
  role: "QA",
  raisedByMe: false,
  blocker: null,
  ...extra,
});

const goLive = (id: string, due: string | null, extra: Partial<LensGoLive> = {}): LensGoLive => ({
  id,
  projectId: "p1",
  projectName: "Project p1",
  milestoneName: `Go-live ${id}`,
  marketId: null,
  marketName: null,
  dueDate: due ? new Date(due) : null,
  gates: null,
  ...extra,
});

const base = (extra: Partial<LensWork>): LensWork => ({ tasks: [], raised: [], projects: [], lens: "developer", implementor: null, ...extra });

describe("which lens a Member gets", () => {
  it("keeps the default lens with no QA or Implementor role", () => {
    expect(chooseMemberLens([])).toBe("developer");
    expect(chooseMemberLens([{ projectId: "a", role: "Developer" }, { projectId: "b", role: "Project Manager" }, { projectId: "c", role: "Sponsor" }])).toBe("developer");
  });

  it("gives QA roles the QA lens and Implementor roles the Implementor lens", () => {
    expect(chooseMemberLens([{ projectId: "a", role: "QA Engineer" }])).toBe("qa");
    expect(chooseMemberLens([{ projectId: "a", role: "QA Lead" }])).toBe("qa");
    expect(chooseMemberLens([{ projectId: "a", role: "Implementation Lead" }])).toBe("implementor");
    expect(chooseMemberLens([{ projectId: "a", role: "Trainer" }])).toBe("implementor");
    expect(chooseMemberLens([{ projectId: "a", role: "Support Analyst" }, { projectId: "b", role: "Developer" }, { projectId: "c", role: "Implementor" }])).toBe("implementor");
  });

  it("weighs each role by the open work on that project", () => {
    const roles = [
      { projectId: "dev", role: "Developer" },
      { projectId: "qa", role: "QA Engineer" },
    ];
    // Four tasks on the Dev project, one on the QA one: most of the work is development.
    expect(chooseMemberLens(roles, new Map([["dev", 4], ["qa", 1]]))).toBe("developer");
    expect(chooseMemberLens(roles, new Map([["dev", 1], ["qa", 3]]))).toBe("qa");
  });

  it("breaks a tie towards the specialist lens: QA, then Implementor", () => {
    expect(chooseMemberLens([{ projectId: "a", role: "Developer" }, { projectId: "b", role: "QA Engineer" }])).toBe("qa");
    expect(chooseMemberLens([{ projectId: "a", role: "Developer" }, { projectId: "b", role: "Implementor" }])).toBe("implementor");
    expect(chooseMemberLens([{ projectId: "a", role: "QA Engineer" }, { projectId: "b", role: "Implementor" }])).toBe("qa");
  });
});

describe("ready to retest", () => {
  it("is a bug in In QA, nothing else", () => {
    expect(isReadyToRetest({ type: "Bug", status: "InQA" })).toBe(true);
    expect(isReadyToRetest({ type: "Bug", status: "InProgress" })).toBe(false);
    expect(isReadyToRetest({ type: "Bug", status: "InReview" })).toBe(false); // code review: not fixed yet
    expect(isReadyToRetest({ type: "Feature", status: "InQA" })).toBe(false); // first-time testing
  });
});

describe("default lens", () => {
  it("is the UX6 list, unchanged", () => {
    const v = lensView(base({ tasks: [task("a", "2026-11-09T06:00:00Z"), task("b", "2026-11-11T10:00:00Z")] }), "overdue", WED, TZ);
    expect(v.tabs.map((t) => t.key)).toEqual(["all", "overdue", "today", "blocked"]);
    expect(v.tab).toBe("overdue");
    expect(v.groups.map((g) => [g.label, g.rows.length])).toEqual([["Overdue", 1]]);
    expect(lensView(base({}), "retest", WED, TZ).tab).toBe("all"); // not a default-lens tab
  });
});

describe("QA lens", () => {
  const work = base({
    lens: "qa",
    tasks: [
      task("run", "2026-11-11T10:00:00Z", { status: "InProgress" }),
      task("fix", "2026-11-11T12:00:00Z", { type: "Bug", status: "InQA" }),
      task("write", "2026-11-13T06:00:00Z"),
    ],
    raised: [
      task("mine-fixed", "2026-11-12T06:00:00Z", { type: "Bug", status: "InQA", raisedByMe: true }),
      task("mine-open", null, { type: "Bug", status: "InProgress", raisedByMe: true }),
    ],
  });

  it("has the artifact's tabs, with retests from both your tasks and the bugs you raised", () => {
    const v = lensView(work, null, WED, TZ);
    expect(v.tabs.map((t) => [t.label, t.count])).toEqual([
      ["All", 4],
      ["Retest", 2],
      ["Today", 2],
      ["Issues I Raised", 2],
    ]);
    expect(v.tabs.every((t) => toTitleCase(t.label) === t.label)).toBe(true);
    expect(v.groups.map((g) => g.label)).toEqual(["Today", "This Week"]);
  });

  it("marks only fixed bugs as retests", () => {
    const v = lensView(work, "retest", WED, TZ);
    const rows = v.groups.flatMap((g) => g.rows);
    expect(rows.map((r) => (r.kind === "task" ? [r.task.id, r.retest] : null))).toEqual([
      ["fix", true],
      ["mine-fixed", true],
    ]);
    const all = lensView(work, "all", WED, TZ).groups.flatMap((g) => g.rows);
    expect(all.filter((r) => r.kind === "task" && r.retest).length).toBe(2);
    expect(lensView(work, "raised", WED, TZ).groups.flatMap((g) => g.rows).length).toBe(2);
  });
});

describe("Implementor lens", () => {
  const work = base({
    lens: "implementor",
    tasks: [task("train", "2026-11-13T06:00:00Z", { role: "Implementor" })],
    implementor: {
      goLives: [goLive("later", "2026-12-04T06:00:00Z"), goLive("undated", null), goLive("next", "2026-11-12T06:00:00Z", { marketId: "m1", marketName: "Subsidiary A" })],
      issues: [{ id: "i1", title: "Printer drivers at 3 branches", projectId: "p1", projectName: "Project p1", severity: "High", status: "Open", raisedAt: new Date("2026-11-10T06:00:00Z"), mine: true }],
      handovers: [{ id: "d1", title: "Operations handover pack", projectId: "p1", projectName: "Project p1", status: "InReview", version: 1, updatedAt: new Date("2026-11-09T06:00:00Z"), mine: false }],
    },
  });

  it("has the artifact's tabs; All shows only the next go-live", () => {
    const v = lensView(work, null, WED, TZ);
    expect(v.tabs.map((t) => [t.label, t.count])).toEqual([
      ["All", 4],
      ["Go-Lives", 3],
      ["Rollout Issues", 1],
      ["Handover", 1],
    ]);
    expect(v.tabs.every((t) => toTitleCase(t.label) === t.label)).toBe(true);
    expect(v.groups.map((g) => [g.label, g.rows.length])).toEqual([
      ["Next Go-Live", 1],
      ["This Week", 1],
      ["Rollout Issues", 1],
      ["Handover", 1],
    ]);
    const next = v.groups[0].rows[0];
    expect(next.kind === "golive" && next.goLive.id).toBe("next");
  });

  it("lists every go-live in its tab, dated first", () => {
    const v = lensView(work, "golives", WED, TZ);
    expect(v.groups.map((g) => [g.label, g.rows.map((r) => (r.kind === "golive" ? r.goLive.id : ""))])).toEqual([
      ["Next Go-Live", ["next"]],
      ["Later Go-Lives", ["later", "undated"]],
    ]);
  });

  it("shows nothing but an empty tab when the server read nothing", () => {
    const v = lensView(base({ lens: "implementor" }), "handover", WED, TZ);
    expect(v.groups).toEqual([]);
    expect(v.tabs[0].count).toBe(0);
  });
});

describe("row helpers", () => {
  it("recognises go-live milestone names", () => {
    for (const n of ["Go-live — pilot branch", "Riverbank Go Live", "Demo Kenya Go-Live", "Launch", "golive"]) expect(GO_LIVE_NAME.test(n)).toBe(true);
    for (const n of ["UAT sign-off — pilot branch", "Riverbank SIT", "Cutover rehearsal"]) expect(GO_LIVE_NAME.test(n)).toBe(false);
  });

  it("counts tenant-local days and words the go-live chip", () => {
    expect(daysUntil(new Date("2026-11-12T06:00:00Z"), WED, TZ)).toBe(1);
    expect(goLiveChip(new Date("2026-11-04T06:00:00Z"), WED, TZ)).toEqual({ tone: "bad", label: "7 days late" });
    expect(goLiveChip(new Date("2026-11-11T15:00:00Z"), WED, TZ)).toEqual({ tone: "warn", label: "Today" });
    expect(goLiveChip(new Date("2026-11-12T06:00:00Z"), WED, TZ)).toEqual({ tone: "warn", label: "Tomorrow" });
    expect(goLiveChip(new Date("2026-11-14T06:00:00Z"), WED, TZ)).toEqual({ tone: "warn", label: "3 days" });
    expect(goLiveChip(new Date("2026-12-04T06:00:00Z"), WED, TZ)).toEqual({ tone: "muted", label: "23 days" });
    expect(goLiveChip(null, WED, TZ)).toEqual({ tone: "muted", label: "No date" });
  });

  it("words issue and handover chips in sentence case", () => {
    expect(issueChip("Open")).toEqual({ tone: "bad", label: "Open" });
    expect(issueChip("Investigating")).toEqual({ tone: "warn", label: "Investigating" });
    expect(handoverChip("InReview")).toEqual({ tone: "info", label: "Waiting" });
    expect(handoverChip("Rejected")).toEqual({ tone: "warn", label: "Returned" });
    expect(handoverChip("Draft")).toEqual({ tone: "muted", label: "Draft" });
  });

  it("sorts undated go-lives last", () => {
    const sorted = sortGoLives([goLive("u", null), goLive("b", "2026-11-20T00:00:00Z"), goLive("a", "2026-11-01T00:00:00Z")]);
    expect(sorted.map((g) => g.id)).toEqual(["a", "b", "u"]);
  });
});

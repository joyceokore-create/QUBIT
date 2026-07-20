import { describe, expect, it } from "vitest";
import { buildBriefing, type BriefingViewer, type RelevanceData } from "@/server/relevance";

// Fixed clock so scoring/ordering is deterministic.
const NOW = new Date("2026-07-17T09:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

// One shared tenant dataset; different viewers see different slices of it.
const DATA: RelevanceData = {
  tasks: [
    { id: "t1", title: "Ship auth", status: "InProgress", dueDate: days(-3), assigneeId: "member", phase: "Development", projectId: "P1", projectCode: "RBS-01" },
    // Blocked is a flag since 6.1 — these two are blocked via the linked blockers below.
    { id: "t2", title: "Wire webhook", status: "InProgress", dueDate: null, assigneeId: "member", phase: "Development", projectId: "P1", projectCode: "RBS-01" },
    { id: "t3", title: "UAT sign-off", status: "InProgress", dueDate: null, assigneeId: "someone", phase: "UAT", projectId: "P2", projectCode: "RBS-02" },
    { id: "t4", title: "Later work", status: "InProgress", dueDate: days(30), assigneeId: "pm", phase: "Design", projectId: "P1", projectCode: "RBS-01" },
  ],
  blockers: [
    { id: "b1", description: "Vendor API down", severity: "Critical", status: "Open", ownerId: "member", taskId: "t2", projectId: "P1", projectCode: "RBS-01" },
    { id: "b2", description: "Env access blocked", severity: "Critical", status: "Open", ownerId: "someone", taskId: "t3", projectId: "P2", projectCode: "RBS-02" },
  ],
  risks: [{ id: "r1", title: "Scope creep", probability: 4, impact: 4, status: "Open", projectId: "P1", projectCode: "RBS-01" }],
  issues: [{ id: "i1", title: "Data mismatch", severity: "High", status: "Open", projectId: "P2", projectCode: "RBS-02" }],
  milestones: [{ id: "m1", name: "MVP1", dueDate: days(-5), status: "Pending", projectId: "P1", projectCode: "RBS-01" }],
  projects: [
    { id: "P1", code: "RBS-01", name: "Atlas", status: "AtRisk", leadUserId: "pm", lastStatusAt: days(-2) },
    { id: "P2", code: "RBS-02", name: "Zephyr", status: "Overdue", leadUserId: null, lastStatusAt: days(-30) },
  ],
  workload: [
    { userId: "pm", name: "Pat M", totalPct: 120 },
    { userId: "member", name: "Mel B", totalPct: 80 },
  ],
};

const MEMBER: BriefingViewer = { userId: "member", roles: ["Member"], myProjectIds: [] };
const PM: BriefingViewer = { userId: "pm", roles: ["ProjectManager"], myProjectIds: ["P1"] };
const EXEC: BriefingViewer = { userId: "exec", roles: ["Executive"], myProjectIds: [] };
const HOP: BriefingViewer = { userId: "hop", roles: ["HeadOfProjects"], myProjectIds: [] };
const HOQA: BriefingViewer = { userId: "hoqa", roles: ["HeadOfQA"], myProjectIds: [] };

const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("relevance — buildBriefing", () => {
  it("surfaces a Member's own overdue task, owned blocker, and blocked task (ranked)", () => {
    const b = buildBriefing(MEMBER, DATA, NOW);
    expect(ids(b)).toEqual(["t1", "b1", "t2"]); // overdue task > critical owned blocker > blocked task
    expect(b.every((i) => i.href === "/my-tasks" || i.href.startsWith("/projects/"))).toBe(true);
  });

  it("gives a ProjectManager their projects' escalations + overdue milestones (not personal tasks)", () => {
    const b = buildBriefing(PM, DATA, NOW);
    expect(ids(b)).toContain("m1"); // overdue milestone on P1
    expect(ids(b)).toContain("r1"); // material risk on P1
    expect(ids(b)).not.toContain("i1"); // issue is on P2, not the PM's project
  });

  it("gives two different users on the SAME tenant different briefings (PROMPT §3)", () => {
    const member = buildBriefing(MEMBER, DATA, NOW);
    const pm = buildBriefing(PM, DATA, NOW);
    expect(ids(member)).not.toEqual(ids(pm));
    // No overlap: the Member sees personal work; the PM sees project governance.
    expect(ids(member).some((id) => ids(pm).includes(id))).toBe(false);
  });

  it("is deterministic — identical inputs produce identical output", () => {
    expect(buildBriefing(MEMBER, DATA, NOW)).toEqual(buildBriefing(MEMBER, DATA, NOW));
    expect(buildBriefing(EXEC, DATA, NOW)).toEqual(buildBriefing(EXEC, DATA, NOW));
  });

  it("gives an Executive a portfolio view (at-risk/overdue projects, critical blockers, slippage) — no personal tasks", () => {
    const b = buildBriefing(EXEC, DATA, NOW);
    expect(b.length).toBe(3);
    expect(ids(b)).not.toContain("t2"); // not the Member's blocked task
    expect(b.every((i) => i.kind === "project" || i.kind === "blocker" || i.kind === "milestone")).toBe(true);
  });

  it("gives HeadOfProjects leadless projects + over-allocation", () => {
    const b = buildBriefing(HOP, DATA, NOW);
    expect(b.some((i) => i.kind === "project" && i.title.includes("no project lead"))).toBe(true);
    expect(b.some((i) => i.kind === "workload" && i.title.includes("over-allocated"))).toBe(true);
  });

  it("gives HeadOfQA blocked-in-test tasks + high-severity issues", () => {
    const b = buildBriefing(HOQA, DATA, NOW);
    expect(b.some((i) => i.id === "t3")).toBe(true); // blocked in UAT
    expect(b.some((i) => i.id === "i1")).toBe(true); // High issue
  });

  it("returns nothing when there's no relevant work, and respects the limit", () => {
    const empty: RelevanceData = { tasks: [], blockers: [], risks: [], issues: [], milestones: [], projects: [], workload: [] };
    expect(buildBriefing(MEMBER, empty, NOW)).toEqual([]);
    expect(buildBriefing(MEMBER, DATA, NOW, 1)).toHaveLength(1);
  });
});

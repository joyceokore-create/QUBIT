// Phase 6.2 board lenses, reworked in M7-D (DM1.43): a task's lane is decided by WHO it
// is assigned to (the assignee's project-role category), and a viewer's role decides
// which lanes they may open at all. Pure filters, tested exhaustively so the board
// component stays thin and the API filter is provably the same rule.
import { describe, expect, it } from "vitest";
import type { ProjectRoleCategory } from "@/lib/roles";
import {
  availableLenses,
  defaultLens,
  laneFor,
  lensFilter,
  taskVisibleTo,
  isTriageBug,
  businessDaysBetween,
  isAging,
  wipOverloads,
} from "@/lib/board-lens";

const task = (
  over: Partial<{ type: string; status: string; assigneeId: string | null; assigneeCategory: ProjectRoleCategory | null }>,
) => ({
  type: "Feature",
  status: "InProgress",
  assigneeId: null,
  assigneeCategory: null,
  ...over,
});

describe("board lenses (6.2 / DM1.43)", () => {
  it("gives PMs every lens, disciplines exactly their lane, stakeholders the read-only whole", () => {
    expect(availableLenses("PM")).toEqual(["all", "dev", "qa", "impl"]);
    expect(availableLenses("Dev")).toEqual(["dev"]);
    expect(availableLenses("QA")).toEqual(["qa"]);
    expect(availableLenses("Implementor")).toEqual(["impl"]);
    expect(availableLenses("Stakeholder")).toEqual(["all"]);
  });

  it("lands each role category on its only (or default) lens", () => {
    expect(defaultLens("Dev")).toBe("dev");
    expect(defaultLens("QA")).toBe("qa");
    expect(defaultLens("Implementor")).toBe("impl");
    expect(defaultLens("PM")).toBe("all");
    expect(defaultLens("Stakeholder")).toBe("all");
  });

  it("lanes a task by its assignee's role — 'assigned to Trevor (a dev) → Dev board'", () => {
    expect(laneFor(task({ assigneeId: "trevor", assigneeCategory: "Dev" }))).toBe("dev");
    expect(laneFor(task({ assigneeId: "t1", assigneeCategory: "QA" }))).toBe("qa");
    expect(laneFor(task({ assigneeId: "i1", assigneeCategory: "Implementor" }))).toBe("impl");
    // The assignee's role wins over the task's type: a bug being FIXED by a dev is dev work.
    expect(laneFor(task({ type: "Bug", assigneeId: "trevor", assigneeCategory: "Dev" }))).toBe("dev");
  });

  it("falls back to task type when nobody categorised is assigned", () => {
    expect(laneFor(task({ type: "Bug" }))).toBe("qa"); // unassigned bug → triage
    expect(laneFor(task({ type: "Feature" }))).toBe("dev");
    expect(laneFor(task({ type: "Chore" }))).toBe("dev");
  });

  it("parks PM/stakeholder-assigned work on the all lane only", () => {
    expect(laneFor(task({ assigneeId: "pm1", assigneeCategory: "PM" }))).toBe("all");
    expect(laneFor(task({ assigneeId: "s1", assigneeCategory: "Stakeholder" }))).toBe("all");
    expect(lensFilter("dev", task({ assigneeId: "pm1", assigneeCategory: "PM" }))).toBe(false);
  });

  it("lensFilter: 'all' passes everything, a discipline lens passes its lane", () => {
    expect(lensFilter("all", task({}))).toBe(true);
    expect(lensFilter("dev", task({ assigneeCategory: "Dev", assigneeId: "d" }))).toBe(true);
    expect(lensFilter("dev", task({ assigneeCategory: "QA", assigneeId: "q" }))).toBe(false);
    expect(lensFilter("impl", task({ assigneeCategory: "Implementor", assigneeId: "i" }))).toBe(true);
  });

  it("taskVisibleTo: disciplines see their lane; PMs and stakeholders see everything", () => {
    const devTask = task({ assigneeId: "d1", assigneeCategory: "Dev" });
    const qaTask = task({ assigneeId: "q1", assigneeCategory: "QA" });
    expect(taskVisibleTo("Dev", "viewer", devTask)).toBe(true);
    expect(taskVisibleTo("Dev", "viewer", qaTask)).toBe(false);
    expect(taskVisibleTo("QA", "viewer", devTask)).toBe(false);
    expect(taskVisibleTo("PM", "viewer", qaTask)).toBe(true);
    expect(taskVisibleTo("Stakeholder", "viewer", qaTask)).toBe(true);
  });

  it("taskVisibleTo: your own task is ALWAYS visible, whatever lane it sits in", () => {
    // A dev assigned a QA-laned card must never be blind to their own work.
    const mine = task({ assigneeId: "viewer", assigneeCategory: "QA" });
    expect(taskVisibleTo("Dev", "viewer", mine)).toBe(true);
    expect(taskVisibleTo("Implementor", "viewer", mine)).toBe(true);
  });

  it("triage = open unassigned bugs only", () => {
    expect(isTriageBug(task({ type: "Bug" }))).toBe(true);
    expect(isTriageBug(task({ type: "Bug", assigneeId: "u1" }))).toBe(false);
    expect(isTriageBug(task({ type: "Bug", status: "Completed" }))).toBe(false);
    expect(isTriageBug(task({}))).toBe(false);
  });

  it("counts business days, skipping weekends", () => {
    const mon = new Date("2026-07-13T09:00:00Z"); // Monday
    const nextMon = new Date("2026-07-20T09:00:00Z");
    expect(businessDaysBetween(mon, nextMon)).toBe(5); // Tue–Fri + Mon
    expect(businessDaysBetween(mon, new Date("2026-07-14T09:00:00Z"))).toBe(1);
    expect(businessDaysBetween(nextMon, mon)).toBe(0); // inverted → 0
  });

  it("ages only in-flight cards, after 5 business days", () => {
    const now = new Date("2026-07-20T12:00:00Z"); // Monday
    const eightDaysAgo = new Date("2026-07-10T12:00:00Z"); // Friday prior — 6 business days
    const twoDaysAgo = new Date("2026-07-18T12:00:00Z");
    expect(isAging(eightDaysAgo, "InProgress", now)).toBe(true);
    expect(isAging(eightDaysAgo, "InReview", now)).toBe(true);
    expect(isAging(eightDaysAgo, "NotStarted", now)).toBe(false); // backlog doesn't age
    expect(isAging(eightDaysAgo, "Completed", now)).toBe(false);
    expect(isAging(twoDaysAgo, "InProgress", now)).toBe(false);
  });

  it("flags people over the soft WIP limit, ignoring drafts", () => {
    const t = (assigneeId: string, over: Partial<{ status: string; approvalStatus: string }> = {}) => ({
      status: "InProgress",
      approvalStatus: "Published",
      assigneeId,
      assigneeName: assigneeId === "a" ? "Dev A" : "Dev B",
      ...over,
    });
    const tasks = [t("a"), t("a"), t("a"), t("a"), t("b"), t("a", { approvalStatus: "Draft" }), t("b", { status: "InReview" })];
    const over = wipOverloads(tasks);
    expect(over).toEqual([{ name: "Dev A", count: 4 }]); // draft excluded; B has 1 in progress
  });
});

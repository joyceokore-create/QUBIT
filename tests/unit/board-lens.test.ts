// Phase 6.2 — board lenses are pure filters over one task list; tested exhaustively here
// so the board component stays thin.
import { describe, expect, it } from "vitest";
import {
  defaultLens,
  lensFilter,
  isTriageBug,
  businessDaysBetween,
  isAging,
  wipOverloads,
} from "@/lib/board-lens";

const task = (over: Partial<{ type: string; status: string; assigneeId: string | null }>) => ({
  type: "Feature",
  status: "InProgress",
  assigneeId: null,
  ...over,
});

describe("board lenses (6.2)", () => {
  it("lands each role category on its lens", () => {
    expect(defaultLens("Dev")).toBe("dev");
    expect(defaultLens("QA")).toBe("qa");
    expect(defaultLens("PM")).toBe("all");
    expect(defaultLens("Stakeholder")).toBe("all");
  });

  it("dev lens: build work plus assigned bugs, never unassigned bugs", () => {
    expect(lensFilter("dev", task({ type: "Chore" }))).toBe(true);
    expect(lensFilter("dev", task({ type: "Bug", assigneeId: "u1" }))).toBe(true);
    expect(lensFilter("dev", task({ type: "Bug", assigneeId: null }))).toBe(false);
  });

  it("qa lens: verification statuses plus all bugs", () => {
    expect(lensFilter("qa", task({ status: "InReview" }))).toBe(true);
    expect(lensFilter("qa", task({ status: "InQA" }))).toBe(true);
    expect(lensFilter("qa", task({ type: "Bug", status: "NotStarted" }))).toBe(true);
    expect(lensFilter("qa", task({ type: "Feature", status: "InProgress" }))).toBe(false);
  });

  it("all lens passes everything; triage = open unassigned bugs only", () => {
    expect(lensFilter("all", task({}))).toBe(true);
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

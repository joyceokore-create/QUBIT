// UX8 — Approvals v1, the pure part: tenant-local ages, the Age filter, oldest-first order,
// tab counts, search and the Project filter.
import { describe, expect, it } from "vitest";
import {
  ageDays,
  ageLabel,
  approvalTabs,
  approvalTitle,
  filterApprovals,
  itemsForTab,
  matchesAge,
  parseTab,
  projectOptions,
  sortApprovals,
  type ApprovalIdea,
  type ApprovalStaffing,
} from "@/lib/approvals";

const TZ = "Africa/Nairobi"; // UTC+3
const NOW = new Date("2026-11-10T09:00:00Z"); // 12:00 in Nairobi

const idea = (id: string, createdAt: string, over: Partial<ApprovalIdea> = {}): ApprovalIdea => ({
  kind: "idea",
  id,
  title: `Idea ${id}`,
  createdAt,
  personName: "user_001",
  status: "New",
  sponsor: "Sponsor A",
  problem: "A synthetic problem statement.",
  expectedValue: null,
  suggestedPortfolioName: null,
  ...over,
});
const req = (id: string, createdAt: string, over: Partial<ApprovalStaffing> = {}): ApprovalStaffing => ({
  kind: "staffing",
  id,
  createdAt,
  personName: "user_002",
  projectId: "p1",
  projectCode: "CIP",
  projectName: "Card Issuing Platform",
  role: "QA Engineer",
  allocationPct: 60,
  windowStart: "2026-12-01T00:00:00.000Z",
  windowEnd: "2027-01-31T00:00:00.000Z",
  note: null,
  ...over,
});

describe("ageDays / ageLabel", () => {
  it("counts tenant-local calendar days, not 24h blocks", () => {
    // 22:30 UTC on the 9th is 01:30 on the 10th in Nairobi → today.
    expect(ageDays("2026-11-09T22:30:00Z", NOW, TZ)).toBe(0);
    // 20:30 UTC on the 9th is 23:30 on the 9th in Nairobi → 1 day.
    expect(ageDays("2026-11-09T20:30:00Z", NOW, TZ)).toBe(1);
    expect(ageDays("2026-11-04T09:00:00Z", NOW, TZ)).toBe(6);
  });
  it("a future time (clock skew) reads as today", () => {
    expect(ageDays("2026-11-11T09:00:00Z", NOW, TZ)).toBe(0);
  });
  it("labels", () => {
    expect([0, 1, 6].map(ageLabel)).toEqual(["Today", "1 day", "6 days"]);
  });
});

describe("matchesAge", () => {
  it("Today is day 0; Last 7 days includes today; Older is beyond 7 days; empty is all", () => {
    expect([0, 1, 7, 8].map((d) => matchesAge("today", d))).toEqual([true, false, false, false]);
    expect([0, 1, 7, 8].map((d) => matchesAge("week", d))).toEqual([true, true, true, false]);
    expect([0, 1, 7, 8].map((d) => matchesAge("older", d))).toEqual([false, false, false, true]);
    expect(matchesAge("", 99)).toBe(true);
    expect(matchesAge("nonsense", 99)).toBe(true);
  });
});

describe("ordering and tabs", () => {
  const items = [idea("b", "2026-11-09T08:00:00Z"), req("r", "2026-11-03T08:00:00Z"), idea("a", "2026-11-04T08:00:00Z")];

  it("most urgent first = waited longest first", () => {
    expect(sortApprovals(items).map((i) => i.id)).toEqual(["r", "a", "b"]);
  });
  it("does not mutate its input", () => {
    const copy = [...items];
    sortApprovals(items);
    expect(items).toEqual(copy);
  });
  it("tab counts match the rows each tab shows", () => {
    const tabs = approvalTabs(items);
    expect(tabs).toEqual([
      { key: "all", label: "All", count: 3 },
      { key: "ideas", label: "Ideas", count: 2 },
      { key: "staffing", label: "Staffing", count: 1 },
    ]);
    for (const t of tabs) expect(itemsForTab(items, t.key)).toHaveLength(t.count);
  });
  it("an unknown tab reads as All", () => {
    expect(parseTab("staffing")).toBe("staffing");
    expect(parseTab("gates")).toBe("all");
    expect(parseTab("")).toBe("all");
  });
});

describe("search and filters", () => {
  const items = [
    idea("i1", "2026-11-10T07:00:00Z", { title: "Self-service statements", personName: "user_003" }),
    req("r1", "2026-11-09T07:00:00Z"),
    req("r2", "2026-10-20T07:00:00Z", { projectId: "p2", projectCode: "MOB", projectName: "Mobile Wallet", personName: "user_004" }),
  ];
  const run = (f: Partial<{ q: string; project: string; age: string }>) =>
    filterApprovals(items, { q: "", project: "", age: "", ...f }, NOW, TZ).map((i) => i.id);

  it("titles a staffing row by its seat and project", () => {
    expect(approvalTitle(items[1])).toBe("1 QA Engineer for Card Issuing Platform");
  });
  it("searches projects and people", () => {
    expect(run({ q: "wallet" })).toEqual(["r2"]);
    expect(run({ q: "MOB" })).toEqual(["r2"]);
    expect(run({ q: "user_003" })).toEqual(["i1"]);
    expect(run({ q: "statements" })).toEqual(["i1"]);
  });
  it("Project filter keeps that project's requests and hides ideas (no project yet)", () => {
    expect(run({ project: "p1" })).toEqual(["r1"]);
  });
  it("Age filter", () => {
    expect(run({ age: "today" })).toEqual(["i1"]);
    expect(run({ age: "week" })).toEqual(["i1", "r1"]);
    expect(run({ age: "older" })).toEqual(["r2"]);
  });
  it("Project options come from the requests, de-duplicated and sorted", () => {
    expect(projectOptions([...items, req("r3", "2026-11-01T07:00:00Z")])).toEqual([
      { value: "p1", label: "Card Issuing Platform" },
      { value: "p2", label: "Mobile Wallet" },
    ]);
  });
});

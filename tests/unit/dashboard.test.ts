import { describe, expect, it } from "vitest";
import {
  avgProgress,
  formatBudget,
  parseBudget,
  ragCounts,
  worstStatus,
} from "@/server/dashboard";

describe("avgProgress", () => {
  it("averages a project's subsidiary progress values", () => {
    expect(avgProgress({ orgStatuses: [{ orgUnitId: "a", progress: 72, status: "AtRisk" }, { orgUnitId: "b", progress: 45, status: "AtRisk" }] })).toBe(59);
  });

  it("returns 0 for a project with no subsidiaries", () => {
    expect(avgProgress({ orgStatuses: [] })).toBe(0);
  });
});

describe("worstStatus", () => {
  it("ranks Overdue above At Risk above On Track", () => {
    expect(worstStatus(["OnTrack", "AtRisk", "Overdue"])).toBe("Overdue");
    expect(worstStatus(["OnTrack", "AtRisk"])).toBe("AtRisk");
    expect(worstStatus(["OnTrack"])).toBe("OnTrack");
  });

  it("falls through Planning to On Track, matching the reference dashboard", () => {
    expect(worstStatus(["Planning"])).toBe("OnTrack");
    expect(worstStatus(["Planning", "AtRisk"])).toBe("AtRisk");
  });

  it("defaults to On Track for an empty list", () => {
    expect(worstStatus([])).toBe("OnTrack");
  });
});

describe("ragCounts", () => {
  it("tallies On Track / At Risk / Overdue and excludes Planning from all three", () => {
    const items = [
      { status: "OnTrack" },
      { status: "OnTrack" },
      { status: "AtRisk" },
      { status: "Overdue" },
      { status: "Planning" },
    ];
    expect(ragCounts(items)).toEqual({ onTrack: 2, atRisk: 1, overdue: 1 });
  });
});

describe("parseBudget / formatBudget", () => {
  it("parses billions and millions into a number of KES", () => {
    expect(parseBudget("KES 2.8B")).toBe(2_800_000_000);
    expect(parseBudget("KES 830M")).toBe(830_000_000);
  });

  it("returns 0 for null/unparseable budgets", () => {
    expect(parseBudget(null)).toBe(0);
    expect(parseBudget("TBD")).toBe(0);
  });

  it("formats large sums back into a compact display string", () => {
    expect(formatBudget(6_730_000_000)).toBe("KES 6.7B");
    expect(formatBudget(830_000_000)).toBe("KES 830M");
  });

  it("round-trips a portfolio budget sum consistently", () => {
    const total = ["KES 2.8B", "KES 1.5B", "KES 1.6B", "KES 830M"]
      .map(parseBudget)
      .reduce((a, b) => a + b, 0);
    expect(formatBudget(total)).toBe("KES 6.7B");
  });
});

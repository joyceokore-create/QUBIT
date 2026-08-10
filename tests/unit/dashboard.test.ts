import { describe, expect, it } from "vitest";
import { avgProgress } from "@/server/dashboard";
import { ragCounts, worstStatus } from "@/server/health";

describe("avgProgress", () => {
  it("averages a project's subsidiary progress values", () => {
    expect(avgProgress({ orgStatuses: [{ progress: 72 }, { progress: 45 }] })).toBe(59);
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
    // DM1.73 (T8): planning + done buckets exist so totals reconcile on every surface.
    expect(ragCounts(items)).toEqual({ onTrack: 2, atRisk: 1, overdue: 1, planning: 1, done: 0 });
  });

  it("buckets Completed and Cancelled as done", () => {
    expect(ragCounts([{ status: "Completed" }, { status: "Cancelled" }, { status: "OnTrack" }])).toEqual({
      onTrack: 1,
      atRisk: 0,
      overdue: 0,
      planning: 0,
      done: 2,
    });
  });
});

// parseBudget/formatBudget died with the dashboard summary KPI (DM1.73 — docs/17 §2
// ordered the budget KPI removed until money is typed in Phase C).

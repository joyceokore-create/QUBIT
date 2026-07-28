import { describe, expect, it } from "vitest";
import { needsAttention, portfolioHealth, projectRag, ragRank } from "@/server/health";

// The ONE health engine (docs/16-revamp-plan.md §10). worstStatus/ragCounts keep their
// long-standing cases in tests/unit/dashboard.test.ts.

describe("projectRag", () => {
  it("maps every project status to the canonical RAG", () => {
    expect(projectRag("Overdue")).toBe("Red");
    expect(projectRag("AtRisk")).toBe("Amber");
    expect(projectRag("OnTrack")).toBe("Green");
    expect(projectRag("Completed")).toBe("Green");
    expect(projectRag("Planning")).toBe("Green");
    expect(projectRag("Cancelled")).toBe("Green");
  });

  it("treats an unknown status as Green rather than inventing trouble", () => {
    expect(projectRag("SomethingNew")).toBe("Green");
  });
});

describe("needsAttention", () => {
  it("flags exactly the non-Green statuses", () => {
    expect(needsAttention("Overdue")).toBe(true);
    expect(needsAttention("AtRisk")).toBe(true);
    expect(needsAttention("OnTrack")).toBe(false);
    expect(needsAttention("Planning")).toBe(false);
    expect(needsAttention("Completed")).toBe(false);
    expect(needsAttention("Cancelled")).toBe(false);
  });
});

describe("ragRank", () => {
  it("orders most-troubled first", () => {
    expect(ragRank("Overdue")).toBeGreaterThan(ragRank("AtRisk"));
    expect(ragRank("AtRisk")).toBeGreaterThan(ragRank("OnTrack"));
    expect(ragRank("OnTrack")).toBe(0);
  });
});

describe("portfolioHealth", () => {
  it("rolls the portfolio into onTrack / needAttention / planning with a pct", () => {
    const h = portfolioHealth(["OnTrack", "Completed", "AtRisk", "Overdue", "Planning", "Cancelled"]);
    expect(h).toEqual({ total: 6, onTrack: 2, needAttention: 2, planning: 2, pct: 33 });
  });

  it("buckets every status exactly once", () => {
    const h = portfolioHealth(["OnTrack", "AtRisk", "Planning", "Overdue", "Completed"]);
    expect(h.onTrack + h.needAttention + h.planning).toBe(h.total);
  });

  it("returns zeros for an empty portfolio (no division by zero)", () => {
    expect(portfolioHealth([])).toEqual({ total: 0, onTrack: 0, needAttention: 0, planning: 0, pct: 0 });
  });
});

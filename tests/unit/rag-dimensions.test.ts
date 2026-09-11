import { describe, expect, it } from "vitest";
import { deriveDimensions, ragPair, isDispute } from "@/server/rag-dimensions";

describe("derived RAG dimensions", () => {
  it("rates a healthy on-track project all green (except budget/quality/scope with no signal)", () => {
    const d = deriveDimensions({ status: "OnTrack", scheduleSlipDays: 0, openRisks: 0, requirementCoverage: 1, openDefects: 0, hasBudgetData: false });
    expect(d.Schedule).toBe("G");
    expect(d.Risk).toBe("G");
    expect(d.Resources).toBe("G");
    expect(d.Scope).toBe("G");
    expect(d.Quality).toBe("G");
    expect(d.Budget).toBe("N"); // no budget data → not rated
  });

  it("schedule: passed target or big slip → red, small slip → amber", () => {
    expect(deriveDimensions({ status: "OnTrack", targetPassed: true }).Schedule).toBe("R");
    expect(deriveDimensions({ status: "OnTrack", scheduleSlipDays: 45 }).Schedule).toBe("R");
    expect(deriveDimensions({ status: "OnTrack", scheduleSlipDays: 10 }).Schedule).toBe("A");
  });

  it("risk: any red risk → red; open risk/blocker → amber", () => {
    expect(deriveDimensions({ status: "OnTrack", redRisks: 1 }).Risk).toBe("R");
    expect(deriveDimensions({ status: "OnTrack", openRisks: 2 }).Risk).toBe("A");
    expect(deriveDimensions({ status: "OnTrack", openBlockers: 1 }).Risk).toBe("A");
  });

  it("resources: unassigned → red, over-allocated → amber", () => {
    expect(deriveDimensions({ status: "OnTrack", unassigned: true }).Resources).toBe("R");
    expect(deriveDimensions({ status: "OnTrack", overAllocated: true }).Resources).toBe("A");
  });

  it("scope: no requirements → not rated; low coverage → amber; changing → red", () => {
    expect(deriveDimensions({ status: "OnTrack", requirementCoverage: null }).Scope).toBe("N");
    expect(deriveDimensions({ status: "OnTrack", requirementCoverage: 0.3 }).Scope).toBe("A");
    expect(deriveDimensions({ status: "OnTrack", scopeChanging: true }).Scope).toBe("R");
  });

  it("quality: no QA signal → not rated; defects scale amber→red", () => {
    expect(deriveDimensions({ status: "OnTrack", openDefects: null }).Quality).toBe("N");
    expect(deriveDimensions({ status: "OnTrack", openDefects: 2 }).Quality).toBe("A");
    expect(deriveDimensions({ status: "OnTrack", openDefects: 5 }).Quality).toBe("R");
  });

  it("dispute: reported greener than calculated is flagged", () => {
    // status OnTrack → reported Green; a blocker makes calculated Amber → dispute.
    const { reported, calculated } = ragPair({ status: "OnTrack", openBlockers: 1 });
    expect(reported).toBe("G");
    expect(calculated).toBe("A");
    expect(isDispute(reported, calculated)).toBe(true);
    // Agreement is not a dispute.
    expect(isDispute("A", "A")).toBe(false);
    // Reported redder than calculated is not a dispute (not sandbagging).
    expect(isDispute("R", "G")).toBe(false);
  });
});

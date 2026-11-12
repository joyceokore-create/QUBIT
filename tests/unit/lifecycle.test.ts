import { describe, expect, it } from "vitest";
import { inactiveReason, lifecycleStage } from "@/lib/lifecycle";

// UX10 (D8b) — one lifecycle-stage rule.
describe("lifecycleStage", () => {
  it("is Live when delivered, Inactive when cancelled or paused, else the pipeline stage", () => {
    expect(lifecycleStage({ status: "Completed", pipelineStage: "Approved" })).toBe("Live");
    expect(lifecycleStage({ status: "Cancelled", pipelineStage: "Approved" })).toBe("Inactive");
    expect(lifecycleStage({ status: "OnTrack", pipelineStage: "Paused" })).toBe("Inactive");
    expect(lifecycleStage({ status: "OnTrack", pipelineStage: "Approved", priority: "Paused" })).toBe("Inactive");
    expect(lifecycleStage({ status: "Planning", pipelineStage: "Evaluating" })).toBe("Evaluating");
    expect(lifecycleStage({ status: "OnTrack", pipelineStage: "Approved" })).toBe("Approved");
    expect(lifecycleStage({ status: "Planning", pipelineStage: "Exploring" })).toBe("Exploring");
  });
  it("says why an initiative is inactive", () => {
    expect(inactiveReason({ status: "Cancelled", pipelineStage: "Approved" })).toBe("Cancelled");
    expect(inactiveReason({ status: "OnTrack", pipelineStage: "Paused" })).toBe("Paused");
    expect(inactiveReason({ status: "OnTrack", pipelineStage: "Approved" })).toBeNull();
  });
});

describe("Shelved portfolios (UX10)", () => {
  it("makes a project Inactive (reason Shelved), but never un-delivers a Live one", () => {
    expect(lifecycleStage({ status: "OnTrack", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toBe("Inactive");
    expect(inactiveReason({ status: "OnTrack", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toBe("Shelved");
    expect(lifecycleStage({ status: "Completed", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toBe("Live");
    expect(inactiveReason({ status: "Cancelled", pipelineStage: "Approved", portfolioCategory: "Shelved" })).toBe("Cancelled");
  });
});

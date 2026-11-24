// UX plan D8a/U4 — health words replace colour names; stages map to their own tokens.
import { describe, expect, it } from "vitest";
import { healthKey, healthWord, stageToken } from "@/lib/status-words";

describe("health words", () => {
  it("maps every RAG spelling to one word", () => {
    for (const v of ["Green", "G", "OnTrack"]) expect(healthWord(v)).toBe("On track");
    for (const v of ["Amber", "A", "AtRisk"]) expect(healthWord(v)).toBe("At risk");
    for (const v of ["Red", "R", "Overdue"]) expect(healthWord(v)).toBe("Off track");
  });
  it("never invents a status for unknown or not-rated values", () => {
    expect(healthKey("N")).toBeNull();
    expect(healthWord(null)).toBe("Not rated");
  });
});

describe("stage tokens", () => {
  it("gives each lifecycle stage its own colour, never a health colour", () => {
    expect(stageToken("Exploring")).toBe("--stage-exploring");
    expect(stageToken("Evaluating")).toBe("--stage-evaluating");
    expect(stageToken("Live")).toBe("--stage-live");
    expect(stageToken("Something else")).toBe("--stage-intake");
  });
});

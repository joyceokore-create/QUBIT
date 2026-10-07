// A report's Stage cell names a delivery gate (or not): whole-word, case-insensitive,
// longest gate name wins, nothing matched → null.
import { describe, expect, it } from "vitest";
import { matchStageGate } from "@/server/status-report/match";

const gates = [
  { name: "BRD", orderIndex: 0 },
  { name: "Prototype", orderIndex: 1 },
  { name: "MVP1", orderIndex: 2 },
  { name: "SIT", orderIndex: 3 },
  { name: "UAT", orderIndex: 4 },
  { name: "Go-Live", orderIndex: 5 },
];

describe("matchStageGate", () => {
  it("finds the named gate regardless of case, punctuation and notes", () => {
    expect(matchStageGate("UAT / Pilot Readiness (VAPT in progress)", gates)?.name).toBe("UAT");
    expect(matchStageGate("go live (planned 14 Oct)", gates)?.name).toBe("Go-Live");
    expect(matchStageGate("Sit", gates)?.name).toBe("SIT");
  });
  it("matches whole words only and prefers the longest name", () => {
    expect(matchStageGate("Situation review", gates)).toBeNull();
    expect(matchStageGate("Prototype", [...gates, { name: "Prototype review", orderIndex: 9 }])?.name).toBe("Prototype");
    expect(matchStageGate("Prototype review", [...gates, { name: "Prototype review", orderIndex: 9 }])?.name).toBe("Prototype review");
  });
  it("is null for an empty or unrelated stage", () => {
    expect(matchStageGate("", gates)).toBeNull();
    expect(matchStageGate("Planning", gates)).toBeNull();
  });
});

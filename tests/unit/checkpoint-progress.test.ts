// docs/18 §2 — "% complete is derived (weighted count of Done/InProgress), never typed".
// The maths is pure, so it is unit-testable without a database.
import { describe, expect, it } from "vitest";
import { derivedProgress } from "@/server/checkpoints";

describe("derivedProgress", () => {
  it("weights Done fully and InProgress by half", () => {
    // 2 Done + 1 InProgress of 6 → (1 + 1 + 0.5) / 6 = 41.7% → 42%
    expect(derivedProgress(["Done", "Done", "InProgress", "NotStarted", "NotStarted", "NotStarted"])).toBe(42);
    expect(derivedProgress(["Done", "Done"])).toBe(100);
    expect(derivedProgress(["InProgress", "InProgress"])).toBe(50);
  });

  it("gives Blocked no credit — a stuck gate is not half-done", () => {
    expect(derivedProgress(["Blocked", "Blocked"])).toBe(0);
    expect(derivedProgress(["Done", "Blocked"])).toBe(50);
    // Blocked and NotStarted score the same; the difference is visible in the state,
    // never smuggled into the number.
    expect(derivedProgress(["Done", "Blocked"])).toBe(derivedProgress(["Done", "NotStarted"]));
  });

  it("is 0 with no checkpoints rather than NaN", () => {
    expect(derivedProgress([])).toBe(0);
  });
});

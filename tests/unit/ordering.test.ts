import { describe, expect, it } from "vitest";
import { ORDER_STEP, needsRenormalize, orderIndexBetween } from "@/server/ordering";

// Fractional ordering (docs/clickup-transformation/03-data-model.md §Conventions).
describe("orderIndexBetween", () => {
  it("returns the first step when the list is empty", () => {
    expect(orderIndexBetween(null, null)).toBe(ORDER_STEP);
  });

  it("appends after the last item", () => {
    expect(orderIndexBetween(1000, null)).toBe(2000);
  });

  it("prepends before the first item", () => {
    expect(orderIndexBetween(null, 1000)).toBe(500);
  });

  it("inserts at the midpoint between two neighbours", () => {
    expect(orderIndexBetween(1000, 2000)).toBe(1500);
    expect(orderIndexBetween(1000, 1500)).toBe(1250);
  });

  it("keeps producing a value strictly between shrinking bounds", () => {
    let lo = 1000;
    const hi = 1001;
    for (let i = 0; i < 20; i++) {
      const mid = orderIndexBetween(lo, hi);
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      lo = mid; // keep inserting just after lo, toward hi
    }
  });

  it("throws when bounds are out of order", () => {
    expect(() => orderIndexBetween(2000, 1000)).toThrow();
    expect(() => orderIndexBetween(1000, 1000)).toThrow();
  });
});

describe("needsRenormalize", () => {
  it("is true only when the gap collapses below epsilon", () => {
    expect(needsRenormalize(1000, 2000)).toBe(false);
    expect(needsRenormalize(1.0, 1.0 + 1e-7)).toBe(true);
    expect(needsRenormalize(null, 2000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { evaluateFormula, assertValidFormula } from "@/server/fields/formula";

// Safe formula evaluator (no eval) — 04-module-specs §3.
describe("evaluateFormula", () => {
  it("respects operator precedence and parentheses", () => {
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
    expect(evaluateFormula("-5 + 2", {})).toBe(-3);
  });

  it("resolves field references (bare and {braced})", () => {
    expect(evaluateFormula("budget - spent", { budget: 1000, spent: 400 })).toBe(600);
    expect(evaluateFormula("{Total Budget} * 1.1", { "Total Budget": 100 })).toBeCloseTo(110);
  });

  it("returns null when a referenced field is missing or non-numeric", () => {
    expect(evaluateFormula("budget * 2", {})).toBeNull();
    expect(evaluateFormula("a + b", { a: 5 })).toBeNull();
  });

  it("returns null on division by zero rather than Infinity", () => {
    expect(evaluateFormula("10 / 0", {})).toBeNull();
  });

  it("never executes arbitrary code — unknown syntax throws, not runs", () => {
    // These are parse errors (rejected), not evaluated as JS.
    expect(() => assertValidFormula("process.exit(1)")).toThrow();
    expect(() => assertValidFormula("1 +")).toThrow();
    expect(() => assertValidFormula("2 ** 3")).toThrow(); // no exponent operator
  });

  it("treats a plain identifier reference to a function-y name as a variable", () => {
    // `alert` is just an undefined variable here → null, not a call.
    expect(evaluateFormula("alert", {})).toBeNull();
  });
});

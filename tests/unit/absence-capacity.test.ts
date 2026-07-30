// Leave-aware capacity maths (docs/16 §5). Pure, so the rule "no more 'on leave but
// 100% allocated'" is pinned exactly rather than inferred from a dashboard.
import { describe, expect, it } from "vitest";
import { absenceWorkingDaysInWindow, availabilityFactor, workingDaysBetween } from "@/server/absence";

// A deliberate Mon–Fri fortnight so weekend handling is visible in the numbers.
const MON = new Date("2026-08-03T00:00:00Z"); // Monday
const FRI2 = new Date("2026-08-14T00:00:00Z"); // Friday, two weeks later

describe("workingDaysBetween", () => {
  it("counts Mon–Fri inclusive and skips weekends", () => {
    expect(workingDaysBetween(MON, new Date("2026-08-07T00:00:00Z"))).toBe(5); // one week
    expect(workingDaysBetween(MON, FRI2)).toBe(10); // two weeks
    expect(workingDaysBetween(MON, MON)).toBe(1); // a single day counts
    // A weekend on its own is zero working days.
    expect(workingDaysBetween(new Date("2026-08-08T00:00:00Z"), new Date("2026-08-09T00:00:00Z"))).toBe(0);
  });

  it("is 0 when the range runs backwards rather than negative", () => {
    expect(workingDaysBetween(FRI2, MON)).toBe(0);
  });
});

describe("absenceWorkingDaysInWindow", () => {
  it("clips an absence to the window", () => {
    const absence = { startDate: new Date("2026-07-27T00:00:00Z"), endDate: new Date("2026-08-05T00:00:00Z") };
    // Only Mon 3rd – Wed 5th fall inside the window.
    expect(absenceWorkingDaysInWindow(absence, MON, FRI2)).toBe(3);
  });

  it("is 0 for an absence entirely outside the window", () => {
    const absence = { startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-05T00:00:00Z") };
    expect(absenceWorkingDaysInWindow(absence, MON, FRI2)).toBe(0);
  });
});

describe("availabilityFactor", () => {
  it("is 1 when nobody is away", () => {
    expect(availabilityFactor([], MON, FRI2)).toBe(1);
  });

  it("drops to 0 when somebody is away the whole window", () => {
    expect(availabilityFactor([{ startDate: MON, endDate: FRI2 }], MON, FRI2)).toBe(0);
  });

  it("halves for one week away out of two", () => {
    const oneWeek = { startDate: MON, endDate: new Date("2026-08-07T00:00:00Z") };
    expect(availabilityFactor([oneWeek], MON, FRI2)).toBe(0.5);
  });

  it("unions overlapping absences instead of double-counting them", () => {
    const a = { startDate: MON, endDate: new Date("2026-08-07T00:00:00Z") }; // 5 days
    const b = { startDate: new Date("2026-08-05T00:00:00Z"), endDate: new Date("2026-08-11T00:00:00Z") }; // overlaps
    // Union is Mon 3rd – Tue 11th = 7 working days of 10, so 0.3 remains.
    expect(availabilityFactor([a, b], MON, FRI2)).toBeCloseTo(0.3, 5);
    // Never negative, however much leave is stacked.
    expect(availabilityFactor([a, a, a, b, b], MON, FRI2)).toBeGreaterThanOrEqual(0);
  });

  it("ignores weekend-only leave — it costs no working capacity", () => {
    const weekend = { startDate: new Date("2026-08-08T00:00:00Z"), endDate: new Date("2026-08-09T00:00:00Z") };
    expect(availabilityFactor([weekend], MON, FRI2)).toBe(1);
  });
});

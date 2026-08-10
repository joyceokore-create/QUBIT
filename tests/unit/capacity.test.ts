// DM1.73 — the one shared capacity-warning implementation (src/lib/capacity.ts),
// consolidated from the project wizard and the assign-members dialog.
import { describe, expect, it } from "vitest";
import { assignmentWarnings } from "@/lib/capacity";

describe("assignmentWarnings", () => {
  it("warns on over-allocation past 100%", () => {
    const out = assignmentWarnings({ name: "Ada", totalPct: 80 }, 30);
    expect(out).toEqual(["Ada would be at 110% (over-allocated)"]);
  });

  it("stays silent at exactly 100%", () => {
    expect(assignmentWarnings({ name: "Ada", totalPct: 60 }, 40)).toEqual([]);
  });

  it("prefers the leave-aware effectivePct over totalPct when both are present", () => {
    // Typed 120% but away half the window → effective 60%: adding 30% is fine.
    expect(assignmentWarnings({ name: "Ada", totalPct: 120, effectivePct: 60 }, 30)).toEqual([]);
    // And the projection uses the effective figure when it DOES overflow.
    expect(assignmentWarnings({ name: "Ada", totalPct: 10, effectivePct: 90 }, 20)).toEqual([
      "Ada would be at 110% (over-allocated)",
    ]);
  });

  it("falls back to totalPct when effectivePct is null/absent", () => {
    expect(assignmentWarnings({ name: "Ada", totalPct: 90, effectivePct: null }, 20)).toEqual([
      "Ada would be at 110% (over-allocated)",
    ]);
  });

  it("warns about leave when the window starts before the person is back", () => {
    const out = assignmentWarnings(
      { name: "Bo", totalPct: 0, onLeaveUntil: "2026-08-20" },
      10,
      { start: "2026-08-15" },
    );
    expect(out).toEqual(["Bo is on leave until 20 Aug"]);
  });

  it("treats a missing start date as starting now (leave clashes by definition)", () => {
    const out = assignmentWarnings({ name: "Bo", totalPct: 0, onLeaveUntil: "2026-08-20" }, 10);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("on leave until");
  });

  it("does not warn when the assignment starts after the person is back", () => {
    const out = assignmentWarnings(
      { name: "Bo", totalPct: 0, onLeaveUntil: "2026-08-20" },
      10,
      { start: "2026-09-01" },
    );
    expect(out).toEqual([]);
  });

  it("surfaces leave-days-in-window (bench rows) and combines with over-allocation", () => {
    const out = assignmentWarnings({ name: "Cy", totalPct: 90, awayDaysInWindow: 4 }, 20);
    expect(out).toEqual([
      "Cy would be at 110% (over-allocated)",
      "Cy has 4d of leave in this window",
    ]);
  });

  it("returns nothing for an available, lightly loaded candidate", () => {
    expect(assignmentWarnings({ name: "Di", totalPct: 20, awayDaysInWindow: 0 }, 30)).toEqual([]);
  });
});

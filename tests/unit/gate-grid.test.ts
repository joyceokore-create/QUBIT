import { describe, expect, it } from "vitest";
import { buildGateGrid, currentGateName, earlierOpenGates, updatedLabel } from "@/lib/gate-grid";

const TZ = "Africa/Nairobi";
// Wednesday 11 Nov 2026, 10:00 Nairobi (07:00 UTC) — ISO week 46.
const NOW = new Date("2026-11-11T07:00:00Z");
const gates = [
  { checkpointId: "g1", name: "BRD" },
  { checkpointId: "g2", name: "MVP1" },
  { checkpointId: "g3", name: "SIT" },
];

describe("currentGateName", () => {
  it("is the furthest gate in progress or blocked", () => {
    expect(currentGateName(["BRD", "MVP1", "SIT"], ["Done", "InProgress", "Blocked"])).toBe("SIT");
    expect(currentGateName(["BRD", "MVP1", "SIT"], ["Done", "InProgress", "NotStarted"])).toBe("MVP1");
  });
  it("falls back to the first open gate, then the last gate", () => {
    expect(currentGateName(["BRD", "MVP1", "SIT"], ["Done", "NotStarted", "NotStarted"])).toBe("MVP1");
    expect(currentGateName(["BRD", "MVP1"], ["Done", "Done"])).toBe("MVP1");
    expect(currentGateName([], [])).toBeNull();
  });
});

describe("updatedLabel", () => {
  it("names the source and a weekday within this week", () => {
    expect(updatedLabel(new Date("2026-11-09T09:00:00Z"), true, NOW, TZ)).toBe("Upload · Mon");
    expect(updatedLabel(new Date("2026-11-11T05:00:00Z"), false, NOW, TZ)).toBe("Edited · today");
  });
  it("uses the tenant's zone for the day", () => {
    // 22:30 UTC on Sun 8 Nov is 01:30 Mon 9 Nov in Nairobi — this week, not last.
    expect(updatedLabel(new Date("2026-11-08T22:30:00Z"), false, NOW, TZ)).toBe("Edited · Mon");
  });
  it("says last week, then a date", () => {
    expect(updatedLabel(new Date("2026-11-05T09:00:00Z"), false, NOW, TZ)).toBe("Edited · last week");
    expect(updatedLabel(new Date("2026-10-12T09:00:00Z"), false, NOW, TZ)).toBe("Edited · 12 Oct");
  });
});

describe("buildGateGrid", () => {
  it("makes one row per market with padded states and the latest change", () => {
    const grid = buildGateGrid({
      gates,
      markets: [
        { orgUnitId: "m1", name: "Market A", flag: null },
        { orgUnitId: "m2", name: "Market B", flag: null },
      ],
      statuses: [
        { orgUnitId: "m1", checkpointId: "g1", state: "Done", source: null, updatedAt: new Date("2026-11-05T09:00:00Z") },
        { orgUnitId: "m1", checkpointId: "g2", state: "InProgress", source: "w45.docx", updatedAt: new Date("2026-11-09T09:00:00Z") },
        { orgUnitId: null, checkpointId: "g1", state: "Done", source: null, updatedAt: new Date("2026-11-10T09:00:00Z") },
        { orgUnitId: "m1", checkpointId: "gone", state: "Done", source: null, updatedAt: new Date("2026-11-11T06:00:00Z") },
      ],
      productLabel: "Product",
      now: NOW,
      timeZone: TZ,
    });
    expect(grid.rows).toHaveLength(2);
    expect(grid.rows[0]).toMatchObject({ orgUnitId: "m1", states: ["Done", "InProgress", "NotStarted"], currentGate: "MVP1", done: 1, updated: "Upload · Mon" });
    expect(grid.rows[1]).toMatchObject({ orgUnitId: "m2", states: ["NotStarted", "NotStarted", "NotStarted"], currentGate: "BRD", done: 0, updated: null });
    expect(grid.product).toMatchObject({ orgUnitId: null, label: "Product", states: ["Done", "NotStarted", "NotStarted"], currentGate: "MVP1", done: 1, updated: "Edited · Tue" });
  });
  it("shows the product track when the project ships to no market", () => {
    const grid = buildGateGrid({ gates, markets: [], statuses: [{ orgUnitId: null, checkpointId: "g1", state: "Bogus", source: null, updatedAt: NOW }], productLabel: "Product", now: NOW, timeZone: TZ });
    expect(grid.rows).toEqual([{ orgUnitId: null, label: "Product", flag: null, states: ["NotStarted", "NotStarted", "NotStarted"], signOff: [null, null, null], currentGate: "BRD", done: 0, updated: "Edited · today" }]);
    expect(grid.product).toBe(grid.rows[0]);
  });
});

describe("earlierOpenGates", () => {
  it("lists earlier gates that are neither done nor blocked", () => {
    const rows = [
      { checkpointId: "a", orderIndex: 0, state: "NotStarted" },
      { checkpointId: "b", orderIndex: 1, state: "Blocked" },
      { checkpointId: "c", orderIndex: 2, state: "Done" },
      { checkpointId: "d", orderIndex: 3, state: "InProgress" },
      { checkpointId: "e", orderIndex: 4, state: "NotStarted" },
    ];
    expect(earlierOpenGates(rows, "e")).toEqual(["a", "d"]);
    expect(earlierOpenGates(rows, "a")).toEqual([]);
    expect(earlierOpenGates(rows, "missing")).toEqual([]);
  });
});

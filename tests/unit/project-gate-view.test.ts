// UX8 — Projects › Gate view: the furthest-behind market rule, row shaping and filters.
import { describe, expect, it } from "vitest";
import type { GateMap, GateState } from "@/lib/cockpit-gates";
import {
  filterGateRows,
  furthestBehindMarket,
  gateTrackRow,
  healthOf,
  stageOfGates,
  stageOptions,
  type GateViewRow,
  type MarketTrack,
} from "@/lib/project-gate-view";

const g = (...s: GateState[]): GateMap => {
  const [brd = "none", proto = "none", mvp1 = "none", sit = "none", uat = "none", golive = "none"] = s;
  return { brd, proto, mvp1, sit, uat, golive };
};
const market = (code: string, gates: GateMap, pct = 0): MarketTrack => ({ code, name: `Market ${code}`, pct, gates });

describe("furthestBehindMarket", () => {
  it("returns null with no markets", () => {
    expect(furthestBehindMarket([])).toBeNull();
  });
  it("picks the market with the fewest Done gates", () => {
    const m = furthestBehindMarket([market("AA", g("done", "done", "prog")), market("BB", g("done", "prog")), market("CC", g("done", "done", "done"))]);
    expect(m?.code).toBe("BB");
  });
  it("breaks a tie toward the blocked market, then the late one", () => {
    expect(furthestBehindMarket([market("AA", g("done", "prog")), market("BB", g("done", "block"))])?.code).toBe("BB");
    expect(furthestBehindMarket([market("AA", g("done", "late")), market("BB", g("done", "prog"))])?.code).toBe("AA");
    // Blocked outranks late.
    expect(furthestBehindMarket([market("AA", g("done", "late")), market("BB", g("done", "block"))])?.code).toBe("BB");
  });
  it("then the lower %, then code A–Z (stable)", () => {
    expect(furthestBehindMarket([market("AA", g("done"), 30), market("BB", g("done"), 20)])?.code).toBe("BB");
    expect(furthestBehindMarket([market("ZZ", g("done"), 20), market("KE", g("done"), 20)])?.code).toBe("KE");
  });
});

describe("stageOfGates", () => {
  it("is the first gate not Done, in lifecycle words", () => {
    expect(stageOfGates(g())).toBe("BRD");
    expect(stageOfGates(g("done"))).toBe("Prototype");
    expect(stageOfGates(g("done", "done", "prog"))).toBe("Build / MVP1");
    expect(stageOfGates(g("done", "done", "done", "block"))).toBe("SIT");
    expect(stageOfGates(g("done", "done", "done", "done", "done", "done"))).toBe("Production");
  });
});

describe("gateTrackRow", () => {
  it("shows the project's own track when it has no markets", () => {
    const r = gateTrackRow({ gates: g("done", "prog"), currentGate: "Prototype", buildTrack: true, pct: 25, markets: [] });
    expect(r).toMatchObject({ gates: g("done", "prog"), stage: "Prototype", pct: 25, market: null, marketCount: 0 });
  });
  it("shows the furthest-behind market and its stage, with the project's one progress %", () => {
    const r = gateTrackRow({
      gates: g("done", "done", "done"),
      currentGate: "SIT",
      buildTrack: true,
      pct: 60,
      markets: [market("KE", g("done", "done", "done"), 50), market("TZ", g("done", "block"), 15)],
    });
    expect(r.market).toEqual({ code: "TZ", name: "Market TZ" });
    expect(r.gates).toEqual(g("done", "block"));
    expect(r.stage).toBe("Prototype");
    expect(r.pct).toBe(60); // one progress % everywhere (T3), not the market's 15
    expect(r.projectPct).toBe(60);
    expect(r.marketCount).toBe(2);
  });
  it("off the build track: no cells, its own current gate as Stage", () => {
    const r = gateTrackRow({ gates: g(), currentGate: "Bank Integration", buildTrack: false, pct: 40, markets: [market("KE", g("done"))] });
    expect(r).toMatchObject({ gates: null, stage: "Bank Integration", pct: 40, market: null });
  });
  it("no template: No gates set", () => {
    expect(gateTrackRow({ gates: g(), currentGate: null, buildTrack: false, pct: 0, markets: [] }).stage).toBe("No gates set");
  });
});

describe("healthOf", () => {
  it("is the confirmed check-in's RAG, else None", () => {
    expect(healthOf(null)).toBe("None");
    expect(healthOf({ rag: "Red", confirmed: false })).toBe("None");
    expect(healthOf({ rag: "Amber", confirmed: true })).toBe("Amber");
  });
});

describe("stageOptions", () => {
  it("orders lifecycle stages first, other gate names A–Z, then No gates set", () => {
    expect(stageOptions(["No gates set", "SIT", "Zeta gate", "BRD", "Alpha gate", "Production", "SIT"])).toEqual([
      "BRD",
      "SIT",
      "Production",
      "Alpha gate",
      "Zeta gate",
      "No gates set",
    ]);
  });
});

describe("filterGateRows", () => {
  const row = (id: string, over: Partial<GateViewRow> = {}): GateViewRow => ({
    id,
    code: `P-${id}`,
    name: `Project ${id}`,
    priority: "High",
    pm: "user_001",
    health: "Green",
    track: { gates: g(), stage: "BRD", pct: 0, projectPct: 0, market: null, marketCount: 0 },
    ...over,
  });
  const none = { pm: "", priority: "", stage: "", health: "" };
  const rows = [
    row("a", { health: "Green" }),
    row("b", { pm: null, health: "Red", priority: "Low" }),
    row("c", { pm: "user_002", health: "None", track: { gates: g("done"), stage: "Prototype", pct: 10, projectPct: 10, market: null, marketCount: 0 } }),
  ];

  it("sorts worst health first, then name", () => {
    expect(filterGateRows(rows, "", none).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("searches project name, code and PM", () => {
    expect(filterGateRows(rows, "user_002", none).map((r) => r.id)).toEqual(["c"]);
    expect(filterGateRows(rows, "p-a", none).map((r) => r.id)).toEqual(["a"]);
  });
  it("filters PM (incl. no PM), priority, stage and health", () => {
    expect(filterGateRows(rows, "", { ...none, pm: "__none" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterGateRows(rows, "", { ...none, priority: "Low" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterGateRows(rows, "", { ...none, stage: "Prototype" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterGateRows(rows, "", { ...none, health: "None" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterGateRows(rows, "", { ...none, health: "Amber" })).toEqual([]);
  });
});

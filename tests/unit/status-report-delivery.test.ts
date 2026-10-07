// Status-report upload — what a one-pager says about delivery, resolved against a
// product's catalog: a market named in the title scopes the row; "Where we are" stages
// become gate states (furthest reading wins, blocked becomes in-progress-with-a-note);
// grid cells and per-market lists become module states; unchanged items are counted,
// not written.
import { describe, expect, it } from "vitest";
import { gateStateFrom, matchName, moduleStateFrom, resolveDelivery, splitTitleMarket, type DeliveryCatalog } from "@/lib/status-report-delivery";
import { matchProjectAndMarket } from "@/server/status-report/match";

const KE = { orgUnitId: "11111111-1111-4111-8111-111111111111", code: "KE", name: "Kenya", flag: "🇰🇪" };
const RW = { orgUnitId: "22222222-2222-4222-8222-222222222222", code: "RW", name: "Rwanda", flag: "🇷🇼" };
const catalog: DeliveryCatalog = {
  projectId: "p1",
  code: "SWIPE",
  name: "Swipe Agent Banking",
  moduleLabel: "Agent channels",
  templateName: "Product build",
  markets: [KE, RW],
  modules: [
    { id: "m-p20", name: "P20 POS", code: "P20POS", kind: "module" },
    { id: "m-ussd", name: "USSD", code: "USSD", kind: "module" },
    { id: "m-hal", name: "Hal device support", code: "HALDEVIS", kind: "module" },
  ],
  gates: [
    { checkpointId: "g-brd", name: "BRD", orderIndex: 0 },
    { checkpointId: "g-mvp", name: "MVP1", orderIndex: 2 },
    { checkpointId: "g-uat", name: "UAT", orderIndex: 4 },
  ],
  gateStates: [
    { orgUnitId: null, checkpointId: "g-brd", state: "InProgress" },
    { orgUnitId: RW.orgUnitId, checkpointId: "g-brd", state: "Done" },
  ],
  moduleStates: [
    { moduleId: "m-p20", orgUnitId: KE.orgUnitId, state: "Live", note: null },
    { moduleId: "m-p20", orgUnitId: RW.orgUnitId, state: "Planned", note: null },
    { moduleId: "m-hal", orgUnitId: KE.orgUnitId, state: "Live", note: null },
  ],
};

describe("words → states", () => {
  it("reads gate words", () => {
    expect(gateStateFrom("COMPLETE")).toEqual({ state: "Done", blockedWanted: false });
    expect(gateStateFrom("Released")).toEqual({ state: "Done", blockedWanted: false });
    expect(gateStateFrom("IN REVIEW")).toEqual({ state: "InProgress", blockedWanted: false });
    expect(gateStateFrom("DECISION")).toEqual({ state: "InProgress", blockedWanted: true });
    expect(gateStateFrom("ON HOLD")).toEqual({ state: "NotStarted", blockedWanted: false });
    expect(gateStateFrom("Some words")).toBeNull();
  });
  it("reads module cell words", () => {
    expect(moduleStateFrom("LIVE")).toBe("Live");
    expect(moduleStateFrom("UAT")).toBe("UAT");
    expect(moduleStateFrom("N/A")).toBe("NotApplicable");
    expect(moduleStateFrom("NOT YET LIVE")).toBe("Planned");
    expect(moduleStateFrom("In build")).toBe("Build");
    expect(moduleStateFrom("5 of 6")).toBeNull();
  });
  it("matches names exactly, by code, or by covering the candidate's words", () => {
    expect(matchName("Kenya", catalog.markets)?.code).toBe("KE");
    expect(matchName("rw", catalog.markets)?.code).toBe("RW");
    expect(matchName("HAL: NEWPOS DEVICE REPAIR & MAINTENANCE", catalog.modules)?.name).toBe("Hal device support");
    expect(matchName("BRD v1 (Riverbank)", catalog.gates)?.name).toBe("BRD");
    expect(matchName("Signed BRD approval", catalog.gates)?.name).toBe("BRD");
    expect(matchName("User journeys", catalog.gates)).toBeNull();
  });
  it("splits a market off the title", () => {
    expect(splitTitleMarket("Swipe Rwanda", catalog.markets)).toEqual({ rest: "swipe", market: RW });
    expect(splitTitleMarket("Swipe in Kenya", catalog.markets).market?.code).toBe("KE");
    expect(splitTitleMarket("Swipe Agent Banking Solution", catalog.markets).market).toBeNull();
  });
  it("matches 'Swipe Rwanda' to the product and its market, and a longer title to the product", () => {
    const projects = [{ id: "p1", code: "SWIPE", name: "Swipe Agent Banking", markets: [KE, RW] }, { id: "p2", code: "KEZA", name: "Keza" }];
    expect(matchProjectAndMarket("Swipe Rwanda", projects)).toMatchObject({ projectId: "p1", confidence: "exact", orgUnitId: RW.orgUnitId });
    expect(matchProjectAndMarket("Swipe Agent Banking Solution", projects)).toMatchObject({ projectId: "p1", confidence: "exact", orgUnitId: null });
    expect(matchProjectAndMarket("Keza", projects)).toMatchObject({ projectId: "p2", orgUnitId: null });
  });
});

describe("resolveDelivery", () => {
  it("turns 'Where we are' into gate changes on the product track, furthest reading winning, unchanged counted", () => {
    const plan = resolveDelivery(
      {
        project: "Swipe Agent Banking Solution",
        gates: [
          { name: "User journeys", stateRaw: "COMPLETE", note: "" },
          { name: "BRD v1 (Riverbank)", stateRaw: "IN REVIEW", note: "" },
          { name: "MVP1", stateRaw: "RELEASED", note: "" },
          { name: "Signed BRD approval", stateRaw: "DECISION", note: "" },
          { name: "UAT", stateRaw: "ON HOLD", note: "" },
        ],
        cells: [],
      },
      catalog,
    );
    expect(plan.market).toBeNull();
    expect(plan.gates.map((g) => [g.name, g.from, g.to])).toEqual([["MVP1", "NotStarted", "Done"]]);
    // BRD is already in progress on the product track; the DECISION reading flags it.
    expect(plan.gatesUnchanged).toBe(2); // BRD (in progress already) + UAT (not started already)
  });
  it("scopes gates to the market the title names", () => {
    const plan = resolveDelivery({ project: "Swipe Rwanda", gates: [{ name: "BRD", stateRaw: "COMPLETE", note: "" }, { name: "MVP1", stateRaw: "IN PROGRESS", note: "" }], cells: [] }, catalog);
    expect(plan.market?.code).toBe("RW");
    expect(plan.gates.map((g) => [g.name, g.from, g.to])).toEqual([["MVP1", "NotStarted", "InProgress"]]);
    expect(plan.gatesUnchanged).toBe(1);
  });
  it("places grid cells (market row × module column) and a banner list (module banner × market row)", () => {
    const plan = resolveDelivery(
      {
        project: "Swipe Agent Banking Solution",
        gates: [],
        cells: [
          { row: "Kenya", column: "P20 POS", stateRaw: "LIVE", note: null },
          { row: "Rwanda", column: "P20 POS", stateRaw: "UAT", note: null },
          { row: "Rwanda", column: "USSD", stateRaw: "UAT", note: null },
          { row: "Kenya", column: "HAL: NEWPOS DEVICE REPAIR & MAINTENANCE", stateRaw: "LIVE", note: "ACTIVELY MANAGING POS" },
          { row: "Rwanda", column: "HAL: NEWPOS DEVICE REPAIR & MAINTENANCE", stateRaw: "NOT YET LIVE", note: null },
          { row: "6 of 6", column: null, stateRaw: "Blocked", note: null },
        ],
      },
      catalog,
    );
    expect(plan.modules.map((m) => `${m.marketCode}:${m.name}:${m.from}→${m.to}`)).toEqual(["KE:Hal device support:Live→Live", "RW:P20 POS:Planned→UAT", "RW:USSD:Planned→UAT"]);
    // Kenya P20 already Live → unchanged; Kenya Hal gains a note → counted as a change.
    expect(plan.modulesUnchanged).toBe(2);
    expect(plan.modules.find((m) => m.marketCode === "KE" && m.name === "Hal device support")?.note).toBe("Actively managing pos");
    expect(plan.unmatched).toEqual([]);
  });
  it("uses the title's market for cells without a row header, and the PM's choice over the title", () => {
    const row = { project: "Swipe Rwanda", gates: [], cells: [{ row: null, column: "USSD", stateRaw: "UAT", note: null }] };
    expect(resolveDelivery(row, catalog).modules.map((m) => `${m.marketCode}:${m.name}:${m.to}`)).toEqual(["RW:USSD:UAT"]);
    expect(resolveDelivery(row, catalog, { market: KE }).modules.map((m) => `${m.marketCode}:${m.name}:${m.to}`)).toEqual(["KE:USSD:UAT"]);
    expect(resolveDelivery(row, catalog, { market: null }).modules.map((m) => `${m.marketCode}:${m.name}:${m.to}`)).toEqual(["null:USSD:UAT"]);
  });
});

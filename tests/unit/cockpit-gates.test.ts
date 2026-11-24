// UX1 — the cockpit reads REAL checkpoint gates and weekly check-ins (docs/37 T1/T2/T6 re-done
// for the September cockpit). The gate/trend maths is pure, so it is unit-testable.
import { describe, expect, it } from "vitest";
import type { CheckpointState } from "@/server/checkpoints";
import { gateKeyOf, gateTrackOf, stageOf, trendFromCheckIns } from "@/server/dashboard-cockpit";
import { requirementCoveragePct } from "@/server/dashboard-qa";

const BUILD = ["BRD", "Prototype", "MVP1", "SIT", "UAT", "Go-Live"].map((name, i) => ({ id: `c${i}`, name }));
const states = (...s: CheckpointState[]) => new Map(s.map((v, i) => [`c${i}`, v]));

describe("gateKeyOf", () => {
  it("maps the Product build gate names, ignoring case and punctuation", () => {
    expect(gateKeyOf("BRD")).toBe("brd");
    expect(gateKeyOf("Prototype")).toBe("proto");
    expect(gateKeyOf("MVP1")).toBe("mvp1");
    expect(gateKeyOf("go-live")).toBe("golive");
    expect(gateKeyOf("Go Live")).toBe("golive");
  });
  it("returns null for gates the cockpit has no column for", () => {
    expect(gateKeyOf("Bank Integration")).toBeNull();
  });
});

describe("gateTrackOf", () => {
  it("shows each gate's stored state, not a guess from % complete", () => {
    const t = gateTrackOf(BUILD, states("Done", "Done", "InProgress"), false);
    expect(t.gates).toEqual({ brd: "done", proto: "done", mvp1: "prog", sit: "none", uat: "none", golive: "none" });
    expect(t.currentGate).toBe("MVP1");
    expect(t.buildTrack).toBe(true);
    // (1 + 1 + 0.5) / 6 — the same derived % the workspace shows.
    expect(t.progress).toBe(42);
  });

  it("marks an in-progress gate late once the target date has passed, and keeps Blocked", () => {
    const t = gateTrackOf(BUILD, states("Done", "Blocked", "InProgress"), true);
    expect(t.gates.proto).toBe("block");
    expect(t.gates.mvp1).toBe("late");
    expect(t.currentGate).toBe("Prototype");
  });

  it("is honest when there is no template: no gates, no stage, no %", () => {
    const t = gateTrackOf([], new Map(), false);
    expect(t.currentGate).toBeNull();
    expect(t.progress).toBeNull();
    expect(Object.values(t.gates).every((g) => g === "none")).toBe(true);
  });

  it("reads Complete when every gate is done", () => {
    const t = gateTrackOf(BUILD, states("Done", "Done", "Done", "Done", "Done", "Done"), false);
    expect(t.currentGate).toBe("Complete");
    expect(t.progress).toBe(100);
  });

  it("keeps a non-build template's own current gate by name", () => {
    const rollout = ["Business Case", "Contract", "Solution Build"].map((name, i) => ({ id: `c${i}`, name }));
    const t = gateTrackOf(rollout, states("Done"), false);
    expect(t.buildTrack).toBe(false);
    expect(t.currentGate).toBe("Contract");
    expect(stageOf(t)).toEqual({ phase: "Execution", stage: "Contract" });
  });
});

describe("stageOf", () => {
  it("names the phase from the real current gate", () => {
    expect(stageOf({ currentGate: "SIT", buildTrack: true })).toEqual({ phase: "Execution", stage: "SIT" });
    expect(stageOf({ currentGate: "Complete", buildTrack: true })).toEqual({ phase: "Closure", stage: "Production" });
    expect(stageOf({ currentGate: null, buildTrack: false })).toEqual({ phase: "Not gated", stage: "No gates set" });
  });
});

describe("trendFromCheckIns", () => {
  const NOW = new Date("2026-11-11T09:00:00.000Z"); // 2026-W46
  const ci = (isoWeek: string, computedRag: string, extra: Partial<{ status: string; ragOverride: string; overrideExpiresAt: Date }> = {}) => ({
    isoWeek,
    status: extra.status ?? "Confirmed",
    computedRag,
    ragOverride: extra.ragOverride ?? null,
    overrideExpiresAt: extra.overrideExpiresAt ?? null,
  });

  it("counts one check-in per project per week — never nightly snapshots", () => {
    const t = trendFromCheckIns([ci("2026-W46", "Green"), ci("2026-W46", "Red"), ci("2026-W45", "Amber")], NOW, 8);
    expect(t.weeks).toHaveLength(8);
    expect(t.series[7]).toEqual([1, 0, 1]);
    expect(t.series[6]).toEqual([0, 1, 0]);
  });

  it("reads a signed override as signed in a closed week, even after it expired", () => {
    // Overridden to Red in W45, expiring the following Wednesday — still Red for W45.
    const row = ci("2026-W45", "Green", { ragOverride: "Red", overrideExpiresAt: new Date("2026-11-11T00:00:00.000Z") });
    expect(trendFromCheckIns([row], NOW, 8).series[6]).toEqual([0, 0, 1]);
    // The computed reading ignores the override.
    expect(trendFromCheckIns([row], NOW, 8, "computed").series[6]).toEqual([1, 0, 0]);
  });

  it("is empty until check-ins exist, and ignores weeks outside the window", () => {
    expect(trendFromCheckIns([], NOW, 8)).toEqual({ weeks: [], series: [] });
    expect(trendFromCheckIns([ci("2026-W30", "Red")], NOW, 8)).toEqual({ weeks: [], series: [] });
  });
});

describe("requirementCoveragePct", () => {
  const req = (...approval: string[]) => ({ taskLinks: approval.map((a) => ({ task: { approvalStatus: a } })) });
  it("counts a requirement covered once a non-Draft task links to it", () => {
    expect(requirementCoveragePct([req("Published"), req("Draft"), req(), req("Draft", "Published")])).toBe(50);
  });
  it("makes no claim without requirements", () => {
    expect(requirementCoveragePct([])).toBeNull();
  });
});

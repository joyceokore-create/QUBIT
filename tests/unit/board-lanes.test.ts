// M-P2a (docs/33, docs/25 §4) — the read-only board's pure pieces: the three-lane
// mapping and the sync-health badge derivation.
import { describe, expect, it } from "vitest";
import { laneOf, BOARD_COLUMNS } from "@/lib/board-lens";
import { syncBadge } from "@/components/workspace/project-board";

describe("laneOf", () => {
  it("maps the five task states onto To do / Doing / Done", () => {
    expect(laneOf("NotStarted")).toBe("todo");
    expect(laneOf("InProgress")).toBe("doing");
    expect(laneOf("InReview")).toBe("doing");
    expect(laneOf("InQA")).toBe("doing");
    expect(laneOf("Completed")).toBe("done");
  });

  it("an unknown state lands in Doing — visible beats dropped", () => {
    expect(laneOf("SomethingNew")).toBe("doing");
  });

  it("there are exactly three lanes and Blocked is not one of them", () => {
    expect(BOARD_COLUMNS.map((c) => c.key)).toEqual(["todo", "doing", "done"]);
  });
});

describe("syncBadge", () => {
  const now = new Date("2026-08-04T12:00:00Z");
  const base = { connected: true, lastSyncError: null, syncIntervalMinutes: 60 };

  it("not connected / null state → off", () => {
    expect(syncBadge(null, now).kind).toBe("off");
    expect(syncBadge({ ...base, connected: false, lastSyncAt: null }, now).kind).toBe("off");
  });

  it("an error wins over freshness", () => {
    expect(
      syncBadge({ ...base, lastSyncAt: "2026-08-04T11:59:00Z", lastSyncError: "401 from YouTrack" }, now).kind,
    ).toBe("error");
  });

  it("fresh within 2× the interval; stale beyond it; pending before the first sync", () => {
    expect(syncBadge({ ...base, lastSyncAt: "2026-08-04T11:00:00Z" }, now).kind).toBe("fresh"); // 60m ≤ 120m
    expect(syncBadge({ ...base, lastSyncAt: "2026-08-04T09:00:00Z" }, now).kind).toBe("stale"); // 180m > 120m
    expect(syncBadge({ ...base, lastSyncAt: null }, now).kind).toBe("stale"); // connected, no sync yet
  });
});

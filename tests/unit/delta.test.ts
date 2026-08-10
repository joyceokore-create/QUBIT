import { describe, expect, it } from "vitest";
import { summarizeDeltas, type DeltaEvent } from "@/server/delta";

// M1 delta feed rollup rules — pure summariser over outbox events.

const NAMES = new Map([
  ["p1", "Mobile Banking 2.0"],
  ["p2", "Fraud Detection"],
]);

function ev(type: string, payload: unknown, entity: Partial<DeltaEvent> = {}): DeltaEvent {
  return {
    type,
    entityType: entity.entityType ?? "project_task",
    entityId: entity.entityId ?? "e1",
    actorId: entity.actorId ?? "someone",
    payload,
    createdAt: new Date("2026-07-27T10:00:00Z"),
  };
}

describe("summarizeDeltas", () => {
  it("rolls counts up per project with pluralisation", () => {
    const items = summarizeDeltas(
      [
        ev("blocker.opened", { projectId: "p1" }),
        ev("blocker.opened", { projectId: "p1" }),
        ev("task.completed", { projectId: "p2" }),
      ],
      NAMES,
      "viewer",
    );
    expect(items.map((i) => i.text)).toEqual([
      "2 blockers opened on Mobile Banking 2.0",
      "1 task completed on Fraud Detection",
    ]);
  });

  it("orders severity: slips and blockers before good news", () => {
    const items = summarizeDeltas(
      [
        ev("task.completed", { projectId: "p1" }),
        ev("blocker.resolved", { projectId: "p1" }),
        ev("blocker.opened", { projectId: "p2" }),
        ev("project.status_changed", { from: "OnTrack", to: "AtRisk" }, { entityType: "project", entityId: "p1" }),
      ],
      NAMES,
      "viewer",
    );
    expect(items[0].tone).toBe("bad");
    expect(items.map((i) => i.tone)).toEqual([...items.map((i) => i.tone)].sort((a, b) => {
      const order = { bad: 0, warn: 1, info: 2, ok: 3 } as const;
      return order[a as keyof typeof order] - order[b as keyof typeof order];
    }));
  });

  it("collapses repeated status changes into one line, last transition wins", () => {
    const items = summarizeDeltas(
      [
        ev("project.status_changed", { from: "OnTrack", to: "AtRisk" }, { entityType: "project", entityId: "p1" }),
        ev("project.status_changed", { from: "AtRisk", to: "Overdue" }, { entityType: "project", entityId: "p1" }),
      ],
      NAMES,
      "viewer",
    );
    const slips = items.filter((i) => i.text.includes("slipped"));
    expect(slips).toHaveLength(1);
    expect(slips[0].text).toBe("Mobile Banking 2.0 slipped to Overdue");
    expect(slips[0].tone).toBe("bad");
  });

  it("reports a recovery when the RAG improves to Green", () => {
    const items = summarizeDeltas(
      [ev("project.status_changed", { from: "AtRisk", to: "OnTrack" }, { entityType: "project", entityId: "p2" })],
      NAMES,
      "viewer",
    );
    expect(items[0].text).toBe("Fraud Detection recovered to On Track");
    expect(items[0].tone).toBe("ok");
  });

  it("ignores a status change that never crosses a RAG boundary", () => {
    const items = summarizeDeltas(
      [ev("project.status_changed", { from: "Planning", to: "OnTrack" }, { entityType: "project", entityId: "p1" })],
      NAMES,
      "viewer",
    );
    expect(items).toHaveLength(0);
  });

  it("counts assignments only for the viewer", () => {
    const items = summarizeDeltas(
      [
        ev("task.assigned", { projectId: "p1", assigneeId: "viewer" }),
        ev("task.assigned", { projectId: "p1", assigneeId: "someone-else" }),
      ],
      NAMES,
      "viewer",
    );
    // DM1.73 (T10): assignments deep-link to /board — /my-tasks was a bare redirect.
    expect(items).toEqual([{ tone: "warn", text: "1 task assigned to you", href: "/board" }]);
  });

  it("skips notification-centric events and caps the list", () => {
    const noise = [ev("join_request.created", { projectId: "p1" }), ev("document.brd_drafted", { projectId: "p1" })];
    const many = Array.from({ length: 12 }, (_, i) => ev("blocker.opened", { projectId: i % 2 ? "p1" : "p2" }));
    const items = summarizeDeltas([...noise, ...many], NAMES, "viewer", 8);
    expect(items.length).toBeLessThanOrEqual(8);
    expect(items.every((i) => i.text.includes("blocker"))).toBe(true);
  });

  it("drops project-scoped deltas whose project no longer resolves (deleted since)", () => {
    const items = summarizeDeltas(
      [
        ev("blocker.opened", { projectId: "deleted-project" }),
        ev("project.status_changed", { from: "OnTrack", to: "Overdue" }, { entityType: "project", entityId: "deleted-project" }),
      ],
      NAMES,
      "viewer",
    );
    expect(items).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { rankFocus } from "@/server/dashboard-dev";
import type { MyTaskRow } from "@/server/project-tasks";

const NOW = new Date("2026-07-28T12:00:00Z");
const base: MyTaskRow = {
  id: "t",
  title: "Task",
  projectId: "p",
  projectCode: "P1",
  projectName: "Project",
  status: "InProgress",
  type: "Feature",
  priority: "Med",
  blocked: false,
  blockedReason: null,
  addedBy: null,
  sourceSystem: null,
  externalKey: null,
  externalUrl: null,
  dueDate: null,
  updatedAt: new Date("2026-07-27T00:00:00Z"),
};
const task = (over: Partial<MyTaskRow>): MyTaskRow => ({ ...base, ...over });

describe("rankFocus (§4: overdue > due soonest > in-review > freshest)", () => {
  it("picks the MOST overdue task first, with an explained reason", () => {
    const picked = rankFocus(
      [
        task({ id: "a", dueDate: new Date("2026-07-26T00:00:00Z") }),
        task({ id: "b", dueDate: new Date("2026-07-20T00:00:00Z") }),
        task({ id: "c", dueDate: new Date("2026-08-01T00:00:00Z") }),
      ],
      NOW,
    )!;
    expect(picked.task.id).toBe("b");
    expect(picked.reason).toContain("overdue");
  });

  it("falls to due-soonest, then in-review, then freshest", () => {
    expect(rankFocus([task({ id: "soon", dueDate: new Date("2026-07-30T00:00:00Z") }), task({ id: "later", dueDate: new Date("2026-08-09T00:00:00Z") })], NOW)!.task.id).toBe("soon");
    expect(rankFocus([task({ id: "rev", status: "InReview" }), task({ id: "plain" })], NOW)!.task.id).toBe("rev");
    expect(
      rankFocus([task({ id: "old", updatedAt: new Date("2026-07-01T00:00:00Z") }), task({ id: "fresh", updatedAt: new Date("2026-07-28T00:00:00Z") })], NOW)!.task.id,
    ).toBe("fresh");
  });

  it("never focuses a blocked or completed task", () => {
    expect(
      rankFocus(
        [
          task({ id: "blocked", blocked: true, dueDate: new Date("2026-07-01T00:00:00Z") }),
          task({ id: "done", status: "Completed" }),
          task({ id: "open" }),
        ],
        NOW,
      )!.task.id,
    ).toBe("open");
    expect(rankFocus([task({ id: "blocked", blocked: true })], NOW)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildDraftLines, effectiveRag } from "@/server/checkins";

const FACTS = {
  tasksCompleted: 0,
  blockersOpened: 0,
  blockersResolved: 0,
  milestonesDone: [] as string[],
  milestonesSlipped: [] as string[],
  overdueTasks: 0,
  progress: 40,
  progressDelta: null as number | null,
};

describe("buildDraftLines", () => {
  it("narrates the week's movement with correct plurals", () => {
    expect(
      buildDraftLines({
        ...FACTS,
        tasksCompleted: 8,
        blockersOpened: 1,
        blockersResolved: 2,
        milestonesDone: ["🇰🇪 KCB Kenya UAT"],
        overdueTasks: 1,
        progressDelta: 5,
        progress: 45,
      }),
    ).toEqual([
      "8 tasks completed this week",
      "1 blocker opened",
      "2 blockers resolved",
      "Milestone done: 🇰🇪 KCB Kenya UAT",
      "1 task overdue right now",
      "Progress +5% (now 45%)",
    ]);
  });

  it("says so honestly when nothing moved", () => {
    expect(buildDraftLines(FACTS)).toEqual(["A quiet week — no tracked movement."]);
  });

  it("caps milestone lines at three per kind", () => {
    const lines = buildDraftLines({ ...FACTS, milestonesDone: ["a", "b", "c", "d", "e"] });
    expect(lines.filter((l) => l.startsWith("Milestone done"))).toHaveLength(3);
  });
});

describe("effectiveRag", () => {
  const now = new Date("2026-07-28T12:00:00Z");
  const base = { status: "Confirmed", computedRag: "Green", ragOverride: null as string | null, overrideExpiresAt: null as Date | null };

  it("uses the computed RAG when there is no override", () => {
    expect(effectiveRag(base, now)).toBe("Green");
  });

  it("honours a live override", () => {
    expect(
      effectiveRag({ ...base, ragOverride: "Amber", overrideExpiresAt: new Date("2026-08-01T00:00:00Z") }, now),
    ).toBe("Amber");
  });

  it("ignores an expired override — overrides can't rot", () => {
    expect(
      effectiveRag({ ...base, ragOverride: "Amber", overrideExpiresAt: new Date("2026-07-27T00:00:00Z") }, now),
    ).toBe("Green");
  });

  it("never honours an override on an unconfirmed draft", () => {
    expect(
      effectiveRag(
        { ...base, status: "Draft", ragOverride: "Red", overrideExpiresAt: new Date("2026-08-01T00:00:00Z") },
        now,
      ),
    ).toBe("Green");
  });
});

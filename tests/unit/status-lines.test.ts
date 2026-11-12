import { describe, expect, it } from "vitest";
import { lineTone } from "@/lib/status-lines";
import { buildDraftLines } from "@/server/checkins";

// The tones are matched against the REAL templates, so a rewording in buildDraftLines
// that silently greys a bullet shows up here.
describe("lineTone", () => {
  it("colours the check-in's own templates", () => {
    const lines = buildDraftLines({
      tasksCompleted: 3,
      blockersOpened: 2,
      blockersResolved: 1,
      milestonesDone: ["UAT entry"],
      milestonesSlipped: ["Go-live"],
      overdueTasks: 1,
      progress: 62,
      progressDelta: 5,
    });
    const tones = Object.fromEntries(lines.map((l) => [l, lineTone(l)]));
    expect(tones["3 tasks completed this week"]).toBe("ok");
    expect(tones["2 blockers opened"]).toBe("bad");
    expect(tones["1 blocker resolved"]).toBe("ok");
    expect(tones["Milestone done: UAT entry"]).toBe("ok");
    expect(tones["Milestone slipped: Go-live"]).toBe("warn");
    expect(tones["1 task overdue right now"]).toBe("bad");
    expect(tones["Progress +5% (now 62%)"]).toBe("ok");
  });

  it("a quiet week and member lines stay neutral; negative progress warns", () => {
    expect(lineTone("A quiet week — no tracked movement.")).toBe("neutral");
    expect(lineTone("Contributor 01: recon fix pending vendor patch")).toBe("neutral");
    expect(lineTone("Progress -3% (now 40%)")).toBe("warn");
  });
});

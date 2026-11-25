// Plan Phase 4 — the managerial summary's rule-based composer and the checks an AI draft
// must pass. Both are pure; the engine choice and data gathering are covered in tests/rls.
import { describe, expect, it } from "vitest";
import { attentionList, checkAiSummary, composeSummary, SUMMARY_MAX, type SummaryInput, type SummaryProject } from "@/lib/rollup-summary";

const p = (code: string, name: string, rag: SummaryProject["rag"], prevRag: SummaryProject["prevRag"], checkIn: SummaryProject["checkIn"] = "Confirmed", narrative: string | null = null): SummaryProject => ({ code, name, pmName: "PM", rag, prevRag, checkIn, narrative });

const base: SummaryInput = {
  isoWeek: "2026-W48",
  projects: [
    p("RBS-01", "Curis", "Red", "Amber", "Confirmed", "UAT slipped two weeks; vendor fix due Friday. Escalated to the Head."),
    p("RBS-02", "Keza", "Amber", "Green", "Confirmed", "Waiting on the bank's API keys."),
    p("RBS-03", "Sig10", "Green", "Amber"),
    p("RBS-04", "Tandra", "Green", "Green", "None"),
    p("RBS-05", "Mandra", "Red", null, "Draft"),
  ],
  decisions: [{ code: "RBS-01", description: "Approve the extra UAT cycle budget", ageDays: 9, severity: "High" }],
  milestones: [{ project: "Keza", name: "Pilot go-live" }],
  leave: { peopleAway: 2, projects: [{ projectName: "Curis", away: 1, members: 4 }] },
};

describe("composeSummary", () => {
  it("writes labelled lines from the facts only", () => {
    const text = composeSummary(base);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Week 48: 2 green, 1 amber, 2 red across 5 projects. 2 worse, 1 better than last week. 3 of 5 PMs reported.");
    expect(lines[1]).toBe("Needs attention: RBS-01 Curis (red, was amber): UAT slipped two weeks; RBS-05 Mandra (red); RBS-02 Keza (amber, was green): Waiting on the bank's API keys.");
    expect(lines[2]).toBe("Decisions needed: RBS-01: Approve the extra UAT cycle budget (9 days).");
    expect(lines[3]).toBe("Next week: 1 milestone due (Keza Pilot go-live); 2 people on leave, Curis most affected.");
    expect(lines[4]).toBe("No update yet: Tandra, Mandra.");
  });

  it("says so when nothing moved, and leaves out lines with nothing to say", () => {
    const text = composeSummary({ isoWeek: "2026-W48", projects: [p("A-1", "Alpha", "Green", "Green"), p("B-1", "Bravo", "Green", "Green")], decisions: [], milestones: [], leave: { peopleAway: 0, projects: [] } });
    expect(text).toBe("Week 48: 2 green, 0 amber, 0 red across 2 projects. No change in status from last week. 2 of 2 PMs reported.");
  });

  it("orders attention by severity, then by how far a project slipped", () => {
    expect(attentionList(base.projects).map((x) => x.code)).toEqual(["RBS-01", "RBS-05", "RBS-02"]);
  });

  it("stays within the roll-up line's limit for a large portfolio by shortening lists", () => {
    const many: SummaryInput = {
      ...base,
      projects: Array.from({ length: 60 }, (_, i) => p(`PRJ-${i}`, `Project number ${i} with a long name`, i % 2 ? "Red" : "Amber", "Green", i % 3 ? "Confirmed" : "None", "A long PM line that explains in detail why this project is not going well this week.")),
      decisions: Array.from({ length: 10 }, (_, i) => ({ code: `PRJ-${i}`, description: "A decision with a fairly long description of what is needed", ageDays: 20, severity: "Critical" })),
    };
    const text = composeSummary(many);
    expect(text.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(text).toMatch(/^Week 48: /);
    expect(text).toMatch(/Needs attention: .*\+\d+ more/);
  });
});

describe("checkAiSummary", () => {
  const codes = base.projects.map((x) => x.code);

  it("strips Markdown and keeps the lines", () => {
    expect(checkAiSummary("**Week 48:** 2 red.\n\n- Needs attention: RBS-01 Curis is red.", codes)).toBe("Week 48: 2 red.\nNeeds attention: RBS-01 Curis is red.");
  });

  it("rejects a draft that names a project code not in the data", () => {
    expect(checkAiSummary("Week 48: steady. Needs attention: RBS-99 Phantom is red.", codes)).toBeNull();
  });

  it("rejects an empty or over-long draft", () => {
    expect(checkAiSummary("ok", codes)).toBeNull();
    expect(checkAiSummary(`Week 48: ${"x".repeat(SUMMARY_MAX)}`, codes)).toBeNull();
  });
});

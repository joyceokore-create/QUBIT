// The member report's summary wording is pure, so it is unit-testable without a DB
// (docs/18 §5.1.1). The member may rewrite these lines in the composer — this is the
// starting draft, not the final word.
import { describe, expect, it } from "vitest";
import { ackedSectionLines, buildSectionLines } from "@/server/member-reports";

const item = (id: string, aging = false) => ({ id, title: `Task ${id}`, status: "InProgress", aging });

describe("buildSectionLines", () => {
  it("counts done, in-flight, and blockers with correct pluralisation", () => {
    const lines = buildSectionLines({
      done: [item("a"), item("b")],
      doing: [item("c")],
      blockersRaised: ["Waiting on vendor"],
      blockersResolved: [],
    });
    expect(lines[0]).toBe("Completed 2 items this week");
    expect(lines[1]).toBe("1 item still in flight");
    expect(lines[2]).toBe("Raised 1 blocker");
  });

  it("calls out aging work rather than burying it", () => {
    const lines = buildSectionLines({
      done: [],
      doing: [item("a", true), item("b", true), item("c")],
      blockersRaised: [],
      blockersResolved: [],
    });
    expect(lines[0]).toContain("3 items still in flight");
    expect(lines[0]).toContain("2 sitting over 5 business days");
  });

  it("says a quiet week honestly instead of inventing progress", () => {
    expect(buildSectionLines({ done: [], doing: [], blockersRaised: [], blockersResolved: [] })).toEqual([
      "No tracked movement on this project this week.",
    ]);
  });
});

// DM1.73 (T6): what an acknowledged section folds into the PM's check-in draft —
// including the member's query, which the PM previously had to re-type.
describe("ackedSectionLines", () => {
  it("folds done count, note AND query into the PM's draft", () => {
    const lines = ackedSectionLines("Amina", {
      done: [item("a"), item("b")],
      note: "Payments retries now idempotent.",
      query: "Has the TZ launch date moved?",
    });
    expect(lines).toEqual([
      "Amina: 2 items completed",
      "Amina: Payments retries now idempotent.",
      "Amina asks: Has the TZ launch date moved?",
    ]);
  });

  it("singular done count, no empty lines for missing note/query", () => {
    expect(ackedSectionLines("Ben", { done: [item("a")], note: null, query: null })).toEqual([
      "Ben: 1 item completed",
    ]);
  });

  it("a query alone still reaches the PM", () => {
    expect(ackedSectionLines("Cara", { done: [], note: null, query: "Who owns the DR runbook?" })).toEqual([
      "Cara asks: Who owns the DR runbook?",
    ]);
  });
});

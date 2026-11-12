// Milestone B — the pure parts of the /reports read model: the RAG tally and the exec
// tiles' one-line reading of the 8-week grid.
import { describe, expect, it } from "vitest";
import { tallyRag } from "@/server/health";
import { deltaSentence, type GridGroup } from "@/server/reports-week";

const weeks = ["2026-W34", "2026-W35", "2026-W36", "2026-W37", "2026-W38", "2026-W39", "2026-W40", "2026-W41"];
type Rag = "Green" | "Amber" | "Red";

/** A row from an 8-char code: G/A/R per week, "." = no check-in that week. */
function row(name: string, code: string) {
  const map: Record<string, Rag | null> = { G: "Green", A: "Amber", R: "Red", ".": null };
  return {
    projectId: name,
    code: name.toUpperCase(),
    name,
    line: null,
    lineWeek: null,
    cells: weeks.map((isoWeek, i) => ({ isoWeek, rag: map[code[i]!] ?? null })),
  };
}
const grid = (...rows: ReturnType<typeof row>[]): GridGroup[] => [{ portfolioName: "P", ragCounts: tallyRag([]), rows }];

describe("tallyRag", () => {
  it("counts G/A/R and how many were derived rather than confirmed", () => {
    expect(
      tallyRag([
        { rag: "Green", computed: false },
        { rag: "Green", computed: true },
        { rag: "Amber", computed: true },
        { rag: "Red", computed: false },
      ]),
    ).toEqual({ green: 2, amber: 1, red: 1, computed: 2 });
  });
});

describe("deltaSentence", () => {
  it("reads an extra green against last week, and says nobody has been red long", () => {
    expect(deltaSentence(grid(row("a", "GGGGGGGG"), row("b", "AAAAAAAG"), row("c", "GGGGGGGG")), weeks)).toBe(
      "Up one green on last week. No project has been red for more than two weeks.",
    );
  });

  it("red movements win over green ones, and counts a three-week red streak", () => {
    expect(deltaSentence(grid(row("a", "GGGGGRRR"), row("b", "GGGGGGGR")), weeks)).toBe(
      "One more red than last week. One project red for three weeks or more.",
    );
  });

  it("is honest when last week recorded nothing", () => {
    expect(deltaSentence(grid(row("a", ".......G")), weeks)).toBe("No check-ins were recorded last week.");
  });

  it("says so when nothing moved", () => {
    expect(deltaSentence(grid(row("a", "GGGGGGGG")), weeks)).toBe("Unchanged from last week. No project has been red for more than two weeks.");
  });
});

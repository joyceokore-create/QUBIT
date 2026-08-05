// M-P3c (docs/34 §1) — the roll-up CSV formatter: quoting is where CSV exports rot,
// so pin commas, double quotes and newlines in free-text fields.
import { describe, expect, it } from "vitest";
import { rollupCsv } from "@/lib/report-csv";
import type { RollupRow } from "@/server/portfolio-reports";

const row = (over: Partial<RollupRow>): RollupRow => ({
  projectId: "p1",
  code: "HQ",
  name: "HomeQuest",
  pmName: "Fixture PM",
  rag: "Green",
  checkIn: "Confirmed",
  submittedToHead: true,
  narrative: null,
  ...over,
});

describe("rollupCsv", () => {
  it("emits a header and one line per row", () => {
    const csv = rollupCsv("2026-W32", [row({}), row({ code: "X2", submittedToHead: false })]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("week,code,project,pm,rag,check_in,sent_to_head,narrative");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2026-W32,HQ,HomeQuest,Fixture PM,Green,Confirmed,yes,");
    expect(lines[2]).toContain(",no,");
  });

  it("quotes commas, escapes quotes, keeps newlines inside the field", () => {
    const csv = rollupCsv("2026-W32", [
      row({ name: "Cards, Loans & More", narrative: 'She said "hold"\nthen resumed' }),
    ]);
    expect(csv).toContain('"Cards, Loans & More"');
    expect(csv).toContain('"She said ""hold""\nthen resumed"');
  });

  it("renders null pm/narrative as empty cells, never the string null", () => {
    const csv = rollupCsv("2026-W32", [row({ pmName: null, narrative: null })]);
    expect(csv).not.toContain("null");
  });
});

import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { coverageLabel, filterQualityRows, QUALITY_CSV_COLUMNS, sortQualityRows, weekLabel, type QualityRow } from "@/lib/quality-report";

const row = (over: Partial<QualityRow> & Pick<QualityRow, "id" | "name">): QualityRow => ({
  code: over.id.toUpperCase(),
  pmName: null,
  stage: null,
  inTesting: false,
  coveragePct: null,
  criticalOpen: 0,
  openBugs: { high: 0, medium: 0, low: 0 },
  overdueTests: 0,
  unassignedTests: 0,
  ...over,
});

describe("UX9 — Reports › Quality rows", () => {
  it("sorts most critical first, then High bugs, overdue, unassigned, then name", () => {
    const rows = [
      row({ id: "a", name: "Alpha" }),
      row({ id: "b", name: "Bravo", openBugs: { high: 3, medium: 0, low: 0 } }),
      row({ id: "c", name: "Charlie", criticalOpen: 1 }),
      row({ id: "d", name: "Delta", criticalOpen: 2 }),
      row({ id: "e", name: "Echo", overdueTests: 4 }),
      row({ id: "f", name: "Foxtrot", unassignedTests: 1 }),
    ];
    expect(sortQualityRows(rows).map((r) => r.id)).toEqual(["d", "c", "b", "e", "f", "a"]);
  });

  it("filters to In testing and searches project, code, PM and stage", () => {
    const rows = [
      row({ id: "p1", name: "Ledger revamp", inTesting: true, pmName: "user_001", stage: "UAT" }),
      row({ id: "p2", name: "Wallet", stage: "MVP1" }),
    ];
    expect(filterQualityRows(rows, "", "testing").map((r) => r.id)).toEqual(["p1"]);
    expect(filterQualityRows(rows, "", "").map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(filterQualityRows(rows, "mvp", "").map((r) => r.id)).toEqual(["p2"]);
    expect(filterQualityRows(rows, "USER_001", "").map((r) => r.id)).toEqual(["p1"]);
    expect(filterQualityRows(rows, "P2", "testing")).toEqual([]);
  });

  it("labels coverage and weeks plainly", () => {
    expect(coverageLabel(null)).toBe("—");
    expect(coverageLabel(62)).toBe("62%");
    expect(weekLabel("2026-W45", "Africa/Nairobi")).toEqual({ short: "W45", monday: "2 Nov" });
    // A zone far west of UTC still names the same Monday.
    expect(weekLabel("2026-W45", "America/Los_Angeles").monday).toBe("2 Nov");
  });

  it("exports the table through the shared serializer, guarding formulas in user text", () => {
    const csv = toCsv([row({ id: "x", name: "=HYPERLINK(1)", coveragePct: 50, criticalOpen: 2, openBugs: { high: 1, medium: 2, low: 3 } })], QUALITY_CSV_COLUMNS);
    const [header, line] = csv.replace(/^﻿/, "").split("\r\n");
    expect(header).toBe(
      "Project,Code,PM,Stage,In testing,Requirement coverage %,Open critical issues,Open bugs: High,Open bugs: Medium,Open bugs: Low,Overdue test tasks,Unassigned test tasks",
    );
    expect(line).toBe("'=HYPERLINK(1),X,,,No,50,2,1,2,3,0,0");
  });
});

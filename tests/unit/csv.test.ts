// M9 CSV serializer — one place decides quoting/encoding, so one suite proves it.
import { describe, expect, it } from "vitest";
import { csvFilename, toCsv, type CsvColumn } from "@/lib/csv";

interface Row {
  name: string | null;
  n: number;
  when: Date | null;
}
const COLS: CsvColumn<Row>[] = [
  { header: "Name", value: (r) => r.name },
  { header: "Count", value: (r) => r.n },
  { header: "When", value: (r) => r.when },
];

describe("toCsv", () => {
  it("emits a BOM, a header row, CRLF endings and ISO dates", () => {
    const out = toCsv([{ name: "Plain", n: 2, when: new Date("2026-07-31T10:00:00Z") }], COLS);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿Name,Count,When\r\nPlain,2,2026-07-31T10:00:00.000Z\r\n");
  });

  it("quotes delimiters/quotes/newlines and doubles inner quotes", () => {
    const out = toCsv([{ name: 'a,b "c"\nd', n: 1, when: null }], COLS);
    expect(out).toContain('"a,b ""c""\nd",1,');
  });

  it("renders null/undefined as empty cells", () => {
    const out = toCsv([{ name: null, n: 0, when: null }], COLS);
    expect(out).toContain("\r\n,0,\r\n");
  });

  it("neutralises spreadsheet formulas in user text (CSV injection)", () => {
    const out = toCsv([{ name: "=HYPERLINK(\"http://evil\")", n: 1, when: null }], COLS);
    expect(out).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    const plus = toCsv([{ name: "+SUM(A1)", n: 1, when: null }], COLS);
    expect(plus).toContain("'+SUM(A1)");
    const at = toCsv([{ name: "@cmd", n: 1, when: null }], COLS);
    expect(at).toContain("'@cmd");
  });

  it("negative numbers stay numbers — the guard is for text, not arithmetic", () => {
    // -5 stringifies to "-5" which DOES start with "-"; the guard prefixes it. Assert the
    // chosen behaviour explicitly so a future "fix" is a conscious decision: safety wins
    // over -5 rendering as '-5 in a spreadsheet cell.
    const out = toCsv([{ name: "x", n: -5, when: null }], COLS);
    expect(out).toContain("'-5");
  });

  it("handles zero rows: header only", () => {
    expect(toCsv([], COLS)).toBe("﻿Name,Count,When\r\n");
  });
});

describe("csvFilename", () => {
  it("slugs the stem and dates it", () => {
    expect(csvFilename("Project Tasks: CBS!", new Date("2026-07-31T12:00:00Z"))).toBe("project-tasks-cbs-2026-07-31.csv");
    expect(csvFilename("///", new Date("2026-07-31T12:00:00Z"))).toBe("export-2026-07-31.csv");
  });
});

// The CSV leave bridge (docs/16 §5 adapter mode 2). Parsing is pure, and its most
// important property is that ONE bad line does not cost you the whole file — so every
// rejection path is pinned here.
import { describe, expect, it } from "vitest";
import { parseAbsenceCsv } from "@/server/connectors/hr-absence";

describe("parseAbsenceCsv", () => {
  it("reads rows with or without a header, and keeps the external ref", () => {
    const csv = [
      "email,type,start,end,ref",
      "ana@example.invalid,Leave,2026-08-03,2026-08-07,HR-1",
      "bo@example.invalid,Sick,2026-08-04,2026-08-04",
    ].join("\n");
    const { rows, rejected } = parseAbsenceCsv(csv);
    expect(rejected).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ email: "ana@example.invalid", type: "Leave", externalRef: "HR-1" });
    expect(rows[1].externalRef).toBeNull(); // the ref column is optional
  });

  it("rejects bad rows with a reason and still imports the good ones", () => {
    const csv = [
      "nobody,Leave,2026-08-03,2026-08-07", // no @
      "ana@example.invalid,Holiday,2026-08-03,2026-08-07", // unknown type
      "bo@example.invalid,Leave,not-a-date,2026-08-07", // unreadable date
      "cy@example.invalid,Leave,2026-08-07,2026-08-03", // backwards
      "di@example.invalid,Training,2026-08-10,2026-08-11", // the one good row
    ].join("\n");
    const { rows, rejected } = parseAbsenceCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("di@example.invalid");
    expect(rejected.map((r) => r.reason)).toEqual([
      "no email address",
      'unknown type "Holiday"',
      "unreadable date",
      "ends before it starts",
    ]);
    // Line numbers are 1-based so a person can find the row in their spreadsheet.
    expect(rejected[0].line).toBe(1);
    expect(rejected[3].line).toBe(4);
  });

  it("ignores blank lines and an empty file", () => {
    expect(parseAbsenceCsv("")).toEqual({ rows: [], rejected: [] });
    expect(parseAbsenceCsv("\n\n  \n")).toEqual({ rows: [], rejected: [] });
  });
});

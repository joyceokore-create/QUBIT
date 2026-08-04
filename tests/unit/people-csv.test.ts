// M-P1e (docs/31 §7) — the import parser: header tolerance, quoting, per-line errors,
// defaults, duplicate detection. All synthetic addresses (@example.invalid).
import { describe, expect, it } from "vitest";
import { parsePeopleCsv } from "@/lib/people-csv";

describe("parsePeopleCsv", () => {
  it("parses rows, tolerates a header, defaults role to Member and group to null", () => {
    const { rows, errors } = parsePeopleCsv(
      "name,email,role,group\nAmina Njeri,amina@t.example.invalid,ProjectManager,pm\nBen Ouma,ben@t.example.invalid,,\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Amina Njeri", email: "amina@t.example.invalid", role: "ProjectManager", group: "pm" });
    expect(rows[1]).toMatchObject({ role: "Member", group: null });
  });

  it("handles quoted fields containing commas", () => {
    const { rows, errors } = parsePeopleCsv('"Njeri, Amina",amina@t.example.invalid,Member,developer');
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe("Njeri, Amina");
  });

  it("emits a per-line error for bad email, unknown role, unknown group — and keeps going", () => {
    const { rows, errors } = parsePeopleCsv(
      [
        "Good One,good@t.example.invalid,Member,qa",
        "Bad Email,not-an-email,Member,",
        "Bad Role,role@t.example.invalid,Wizard,",
        "Bad Group,group@t.example.invalid,Member,ninja",
        "Also Good,also@t.example.invalid,Executive,executive",
      ].join("\n"),
    );
    expect(rows.map((r) => r.email)).toEqual(["good@t.example.invalid", "also@t.example.invalid"]);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("flags in-file duplicate emails (case-insensitive) and lowercases the kept one", () => {
    const { rows, errors } = parsePeopleCsv(
      "A,dup@t.example.invalid,Member,\nB,DUP@T.EXAMPLE.INVALID,Member,\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("dup@t.example.invalid");
    expect(errors[0].message).toContain("Duplicate");
  });

  it("skips blank lines and needs at least name,email", () => {
    const { rows, errors } = parsePeopleCsv("\n\nOnly Name\n");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});

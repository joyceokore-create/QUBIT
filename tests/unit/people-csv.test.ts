// M-P1e (docs/31 §7) — the import parser: header tolerance, quoting, per-line errors,
// defaults, duplicate detection. All synthetic addresses (@example.invalid).
import { describe, expect, it } from "vitest";
import { parsePeopleCsv, parseProjectCodes, PEOPLE_COLUMNS, PEOPLE_IMPORT_TEMPLATE } from "@/lib/people-csv";

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
    const { rows, errors } = parsePeopleCsv('name,email,role,group\n"Njeri, Amina",amina@t.example.invalid,Member,developer');
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe("Njeri, Amina");
    expect(rows[0].group).toBe("developer");
  });

  it("emits a per-line error for bad email, unknown role, unknown group — and keeps going", () => {
    const { rows, errors } = parsePeopleCsv(
      [
        "name,email,role,group",
        "Good One,good@t.example.invalid,Member,qa",
        "Bad Email,not-an-email,Member,",
        "Bad Role,role@t.example.invalid,Wizard,",
        "Bad Group,group@t.example.invalid,Member,ninja",
        "Also Good,also@t.example.invalid,Executive,executive",
      ].join("\n"),
    );
    expect(rows.map((r) => r.email)).toEqual(["good@t.example.invalid", "also@t.example.invalid"]);
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
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

  // ── PM onboarding (Oct 2026): the template, project codes, Excel tolerance ──

  it("the template has the five columns in order and only synthetic rows", () => {
    expect(PEOPLE_COLUMNS).toEqual(["name", "email", "role", "projects", "group"]);
    const { rows, errors } = parsePeopleCsv(PEOPLE_IMPORT_TEMPLATE);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.email.endsWith("@example.invalid"))).toBe(true);
    expect(rows[0]).toMatchObject({ role: "ProjectManager", projects: ["KEZA", "SWIPE-KE"], group: null });
  });

  it("reads projects as ;-separated codes — upper-cased, de-duplicated, malformed ones reported", () => {
    expect(parseProjectCodes(" keza; SWIPE-KE ;;keza ")).toEqual({ codes: ["KEZA", "SWIPE-KE"], bad: [] });
    expect(parseProjectCodes("KEZA;not a code")).toEqual({ codes: ["KEZA"], bad: ["not a code"] });
    const { rows, errors } = parsePeopleCsv("name,email,role,projects,group\nA,a@t.example.invalid,ProjectManager,KEZA;bad code,\nB,b@t.example.invalid,ProjectManager,anchor,");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("bad code");
    expect(rows[0]).toMatchObject({ email: "b@t.example.invalid", projects: ["ANCHOR"] });
  });

  it("tolerates what Excel does: a BOM, CRLF, and reordered or aliased columns", () => {
    const { rows, errors } = parsePeopleCsv("\uFEFFEmail,Project codes,Full name,Role\r\nx@t.example.invalid,KEZA,Xavier,ProjectManager\r\n");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "Xavier", email: "x@t.example.invalid", role: "ProjectManager", projects: ["KEZA"], group: null });
  });

  it("a header-less file still follows the template order", () => {
    const { rows } = parsePeopleCsv("Y,y@t.example.invalid,Member,KEZA,pm");
    expect(rows[0]).toMatchObject({ projects: ["KEZA"], group: "pm" });
  });
});

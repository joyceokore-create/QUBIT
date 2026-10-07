// M-P1e (docs/31 §3) — the people import: parse + validate `name,email,role,projects,group`
// rows BEFORE anything touches the database, so the preview table can show valid/invalid
// per row and a bad line never aborts the batch. Pure — unit-tested.
//
// PM onboarding (Oct 2026): the file is a TEMPLATE people download, fill in Excel and
// upload, so it tolerates what Excel does — a BOM, CRLF, quoted cells, reordered columns
// (the header decides) — and carries the person's projects as codes separated by `;`.
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { USER_GROUPS } from "@/lib/personas";

export interface PeopleRow {
  line: number;
  name: string;
  email: string;
  role: string;
  /** Project codes (upper-cased, de-duplicated) the person is assigned to on import. */
  projects: string[];
  group: string | null;
}
export interface PeopleRowError {
  line: number;
  message: string;
}

/** The template's columns, in the order the download and the help text show them. */
export const PEOPLE_COLUMNS = ["name", "email", "role", "projects", "group"] as const;
type Column = (typeof PEOPLE_COLUMNS)[number];

/** Downloadable template: header + two clearly synthetic rows. CRLF so Excel opens it cleanly. */
export const PEOPLE_IMPORT_TEMPLATE =
  [
    PEOPLE_COLUMNS.join(","),
    "user_001,user_001@example.invalid,ProjectManager,KEZA;SWIPE-KE,",
    "user_002,user_002@example.invalid,ProjectManager,ANCHOR,",
  ].join("\r\n") + "\r\n";

const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

/** Minimal CSV field splitter with double-quote support ("a,b",c → [a,b][c]). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/** A header row maps column name → position; without one the template order applies. */
function headerMap(first: string[]): Partial<Record<Column, number>> | null {
  const names = first.map((f) => f.toLowerCase().replace(/\s+/g, ""));
  if (!names.includes("email")) return null;
  const map: Partial<Record<Column, number>> = {};
  for (const col of PEOPLE_COLUMNS) {
    const i = names.indexOf(col === "projects" ? "projects" : col);
    if (i >= 0) map[col] = i;
  }
  // Common aliases people type in Excel.
  if (map.projects === undefined) {
    const alt = names.findIndex((n) => n === "project" || n === "projectcodes" || n === "codes");
    if (alt >= 0) map.projects = alt;
  }
  if (map.name === undefined) {
    const alt = names.findIndex((n) => n === "fullname" || n === "person");
    if (alt >= 0) map.name = alt;
  }
  return map;
}

/** `KEZA; swipe-ke;;KEZA` → ["KEZA", "SWIPE-KE"]; a malformed code is reported, not dropped. */
export function parseProjectCodes(cell: string): { codes: string[]; bad: string[] } {
  const codes: string[] = [];
  const bad: string[] = [];
  for (const raw of cell.split(/[;|]/)) {
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    if (!CODE.test(code)) bad.push(raw.trim());
    else if (!codes.includes(code)) codes.push(code);
  }
  return { codes, bad };
}

export function parsePeopleCsv(text: string): { rows: PeopleRow[]; errors: PeopleRowError[] } {
  const rows: PeopleRow[] = [];
  const errors: PeopleRowError[] = [];
  const seen = new Set<string>();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  // The template order unless a header says otherwise.
  let map: Partial<Record<Column, number>> = { name: 0, email: 1, role: 2, projects: 3, group: 4 };
  let startAt = 0;
  const firstLine = lines.findIndex((l) => l.trim());
  if (firstLine >= 0) {
    const fromHeader = headerMap(splitCsvLine(lines[firstLine]!));
    if (fromHeader) {
      map = fromHeader;
      startAt = firstLine + 1;
    }
  }
  const cell = (fields: string[], col: Column) => (map[col] === undefined ? "" : (fields[map[col]!] ?? ""));

  lines.forEach((raw, i) => {
    if (i < startAt) return;
    const line = i + 1;
    if (!raw.trim()) return;
    const fields = splitCsvLine(raw);
    const name = cell(fields, "name");
    const email = cell(fields, "email");
    const role = cell(fields, "role");
    const group = cell(fields, "group");
    const projectsCell = cell(fields, "projects");

    if (!name || !email) {
      errors.push({ line, message: "Needs at least name and email." });
      return;
    }
    if (!EMAIL.test(email)) {
      errors.push({ line, message: `"${email}" is not a valid email.` });
      return;
    }
    const lower = email.toLowerCase();
    if (seen.has(lower)) {
      errors.push({ line, message: `Duplicate email in the file: ${email}.` });
      return;
    }
    const roleKey = role || "Member";
    if (!(ROLE_KEYS as readonly string[]).includes(roleKey)) {
      errors.push({ line, message: `Unknown role "${role}" — use one of ${ROLE_KEYS.join(", ")}.` });
      return;
    }
    const groupKey = group || null;
    if (groupKey && !(USER_GROUPS as readonly string[]).includes(groupKey)) {
      errors.push({ line, message: `Unknown group "${group}" — use one of ${USER_GROUPS.join(", ")}.` });
      return;
    }
    const { codes, bad } = parseProjectCodes(projectsCell);
    if (bad.length) {
      errors.push({ line, message: `Project code${bad.length === 1 ? "" : "s"} not recognisable: ${bad.join(", ")} — use the code shown on the project (e.g. KEZA), separated by ;.` });
      return;
    }
    seen.add(lower);
    rows.push({ line, name, email: lower, role: roleKey, projects: codes, group: groupKey });
  });

  return { rows, errors };
}

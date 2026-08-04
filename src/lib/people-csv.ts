// M-P1e (docs/31 §3) — the org-setup people import: parse + validate `name,email,role,group`
// rows BEFORE anything touches the database, so the preview table can show valid/invalid
// per row and a bad line never aborts the batch. Pure — unit-tested.
import { ROLE_PERMISSIONS } from "@/lib/rbac";
import { USER_GROUPS } from "@/lib/personas";

export interface PeopleRow {
  line: number;
  name: string;
  email: string;
  role: string;
  group: string | null;
}
export interface PeopleRowError {
  line: number;
  message: string;
}

const ROLE_KEYS = Object.keys(ROLE_PERMISSIONS);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function parsePeopleCsv(text: string): { rows: PeopleRow[]; errors: PeopleRowError[] } {
  const rows: PeopleRow[] = [];
  const errors: PeopleRowError[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    // A header row is welcome but not required.
    if (i === 0 && /^name\s*,\s*email/i.test(raw)) return;

    const [name, email, role, group] = splitCsvLine(raw);
    if (!name || !email) {
      errors.push({ line, message: "Needs at least name,email." });
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
    seen.add(lower);
    rows.push({ line, name, email: lower, role: roleKey, group: groupKey });
  });

  return { rows, errors };
}

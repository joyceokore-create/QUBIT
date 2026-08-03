/**
 * CSV export (docs/16 §9, M9) — ONE serializer for every table surface, so quoting and
 * encoding decisions are made once. Pure; unit-tested.
 *
 * Format choices, deliberate:
 *  - UTF-8 BOM: without it Excel guesses the encoding and mangles non-ASCII names.
 *  - CRLF line endings: RFC 4180, and what Excel expects.
 *  - Formula-injection guard: a cell starting with = + - @ gets a leading apostrophe.
 *    Task titles and commit messages are USER text; "=HYPERLINK(...)" in a title must
 *    open as text in a spreadsheet, never execute (OWASP CSV injection).
 *  - XLSX is deferred (DM1.45): a real .xlsx writer needs a dependency that isn't in
 *    docs/03; BOM'd CSV opens cleanly in Excel, which is what the ask was.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

function cell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let s: string;
  if (raw instanceof Date) s = raw.toISOString();
  else if (typeof raw === "number" || typeof raw === "boolean") s = String(raw);
  else s = String(raw);

  // Neutralise spreadsheet formulas in user-supplied text (never numbers/bools — those
  // were stringified above from safe primitives, but the guard keys off the FIRST CHAR
  // of the final string, so "=..." from any source is caught).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;

  // Quote when the cell contains a delimiter, quote, or newline; double the quotes.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize rows to a CSV string (with BOM). Column order = the export's contract. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => cell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** RFC 6266 attachment filename: safe subset, dated so downloads sort. */
export function csvFilename(stem: string, now = new Date()): string {
  const safe = stem.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${safe}-${now.toISOString().slice(0, 10)}.csv`;
}

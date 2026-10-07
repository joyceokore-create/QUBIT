import "server-only";
import { readZip, ZipError } from "@/lib/zip-read";
import type { Rag } from "@/server/health";

/**
 * Status-report upload — turn Riverbank's weekly "Project Status Report" (Word, Excel or
 * PDF; one row per project: Project · Status · Stage · Update and Outlook) into rows the
 * PM reviews. Parsing is tolerant: the table is found by its header, text split across
 * Word runs is joined, a cell's paragraphs become line breaks. Limits are the ones the
 * check-in and status-note fields enforce, applied with a warning rather than a refusal.
 */

export const NARRATIVE_MAX = 500;
export const STAGE_MAX = 200;
export const FILE_MAX_BYTES = 5 * 1024 * 1024;

export interface ParsedRow {
  line: number;
  project: string;
  status: Rag | null;
  statusRaw: string;
  stage: string;
  update: string;
  warnings: string[];
}

export interface ParsedReport {
  preparedBy: string | null;
  reportDate: string | null;
  rows: ParsedRow[];
  warnings: string[];
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

export type ReportFormat = "docx" | "xlsx" | "pdf";

export function detectFormat(fileName: string, buf: Buffer): ReportFormat {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (ext === "docx" && isZip) return "docx";
  if (ext === "xlsx" && isZip) return "xlsx";
  if (ext === "pdf" && isPdf) return "pdf";
  if (isPdf) return "pdf";
  if (isZip) throw new ParseError("That file is a ZIP container but not a .docx or .xlsx — rename it or export it again.");
  throw new ParseError("Upload the status report as Word (.docx), Excel (.xlsx) or PDF.");
}

// ── shared text helpers ──────────────────────────────────────────────────────────────
const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const squash = (s: string) => s.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export function normaliseStatus(raw: string): Rag | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/^(g|green)\b/.test(s) || /on track/.test(s)) return "Green";
  if (/^(a|amber|yellow)\b/.test(s) || /needs attention|at risk\b/.test(s) && !/^red/.test(s)) return "Amber";
  if (/^(r|red)\b/.test(s) || /off track|critical/.test(s)) return "Red";
  return null;
}

function isHeader(cells: string[]): boolean {
  const f = cells.map((c) => c.toLowerCase());
  return f.some((c) => c.includes("project")) && f.some((c) => c.includes("status")) && f.some((c) => c.includes("update") || c.includes("outlook") || c.includes("comment"));
}

/** Column positions from a header row (any order), falling back to the template's. */
function columns(header: string[]): { project: number; status: number; stage: number; update: number } {
  const f = header.map((c) => c.toLowerCase());
  const find = (...needles: string[]) => f.findIndex((c) => needles.some((n) => c.includes(n)));
  const project = find("project");
  const status = find("status", "rag");
  const stage = find("stage", "phase");
  const update = find("update", "outlook", "comment", "narrative");
  return { project: project < 0 ? 0 : project, status: status < 0 ? 1 : status, stage, update: update < 0 ? (stage >= 0 ? 3 : 2) : update };
}

function rowsFromTable(table: string[][], warnings: string[]): ParsedRow[] {
  const headerAt = table.findIndex(isHeader);
  if (headerAt < 0) return [];
  const col = columns(table[headerAt]!);
  const rows: ParsedRow[] = [];
  let ignored = 0;
  table.slice(headerAt + 1).forEach((cells, i) => {
    // The project cell's first line is the name; anything under it ("CODE · PM", a
    // portfolio) is context the matcher doesn't need.
    const project = squash(cells[col.project] ?? "").split("\n")[0]!.trim();
    if (!project) return;
    const statusRaw = squash(cells[col.status] ?? "");
    const status = normaliseStatus(statusRaw);
    let stage = col.stage >= 0 ? squash(cells[col.stage] ?? "").replace(/\s*\n\s*/g, " ") : "";
    let update = squash(cells[col.update] ?? "");
    // A line with neither a status nor an update is a group heading or a footnote
    // ("Note: status updates as provided…"), not a project.
    if (!statusRaw && !update) {
      ignored++;
      return;
    }
    const w: string[] = [];
    if (statusRaw && !status) w.push(`Status "${statusRaw}" isn't Green, Amber or Red — pick one.`);
    if (!statusRaw) w.push("No status in the file — pick one.");
    if (stage.length > STAGE_MAX) {
      stage = stage.slice(0, STAGE_MAX - 1).trimEnd() + "…";
      w.push(`Stage shortened to ${STAGE_MAX} characters.`);
    }
    if (update.length > NARRATIVE_MAX) {
      update = update.slice(0, NARRATIVE_MAX - 1).trimEnd() + "…";
      w.push(`Update shortened to ${NARRATIVE_MAX} characters — the full text stays in the attached report.`);
    }
    if (!update) w.push("No update text for this project.");
    rows.push({ line: headerAt + 2 + i, project, status, statusRaw, stage, update, warnings: w });
  });
  if (rows.length === 0) warnings.push("The table was found but had no project rows.");
  else if (ignored) warnings.push(`${ignored} heading/footnote ${ignored === 1 ? "line" : "lines"} in the table ignored.`);
  return rows;
}

function metaFromText(text: string): { preparedBy: string | null; reportDate: string | null } {
  const by = text.match(/prepared by:?\s*([^\n]+?)(?=\s+date:|\s+classification:|\n|$)/i);
  const date = text.match(/\bdate:?\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i);
  return { preparedBy: by ? squash(by[1]!).replace(/,\s*$/, "") : null, reportDate: date ? date[1]!.trim() : null };
}

// ── Word ─────────────────────────────────────────────────────────────────────────────
function docxCellText(cellXml: string): string {
  const paras = cellXml.split(/<\/w:p>/).map((p) => {
    const runs = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unescape(m[1]!));
    const breaks = (p.match(/<w:br\b/g) ?? []).length;
    return runs.join("") + (breaks ? "\n" : "");
  });
  return squash(paras.join("\n"));
}

export function parseDocx(buf: Buffer): ParsedReport {
  let xml: string;
  try {
    const entry = readZip(buf).get("word/document.xml");
    if (!entry) throw new ParseError("Not a Word document (word/document.xml missing).");
    xml = entry.read().toString("utf8");
  } catch (e) {
    if (e instanceof ZipError) throw new ParseError(`Could not open the Word file: ${e.message}`);
    throw e;
  }
  const warnings: string[] = [];
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((t) =>
    [...t[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((tr) => [...tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((tc) => docxCellText(tc[0]))),
  );
  let rows: ParsedRow[] = [];
  for (const table of tables) {
    rows = rowsFromTable(table, warnings);
    if (rows.length) break;
  }
  if (!tables.length) warnings.push("No table found in the document.");
  else if (!rows.length && !warnings.length) warnings.push("No table with Project / Status / Update columns was found.");
  // Header paragraphs (outside tables) carry "Prepared by … Date …".
  const bodyText = squash(
    xml
      .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, "")
      .split(/<\/w:p>/)
      .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unescape(m[1]!)).join(""))
      .join("\n"),
  );
  return { ...metaFromText(bodyText), rows, warnings };
}

// ── Excel ────────────────────────────────────────────────────────────────────────────
export function parseXlsx(buf: Buffer): ParsedReport {
  let entries;
  try {
    entries = readZip(buf);
  } catch (e) {
    if (e instanceof ZipError) throw new ParseError(`Could not open the Excel file: ${e.message}`);
    throw e;
  }
  const sst = entries.get("xl/sharedStrings.xml")?.read().toString("utf8") ?? "";
  const shared = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unescape([...m[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]!).join("")));
  const sheets = [...entries.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  const warnings: string[] = [];
  let rows: ParsedRow[] = [];
  let bodyText = "";
  for (const name of sheets) {
    const xml = entries.get(name)!.read().toString("utf8");
    const table: string[][] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of row[1]!.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = c[1]!;
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
        const idx = ref.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
        const type = /t="(\w+)"/.exec(attrs)?.[1];
        let value = "";
        if (type === "s") {
          const v = /<v>(\d+)<\/v>/.exec(c[2]!)?.[1];
          value = v ? (shared[Number(v)] ?? "") : "";
        } else if (type === "inlineStr") {
          value = unescape([...c[2]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]!).join(""));
        } else {
          value = unescape(/<v>([\s\S]*?)<\/v>/.exec(c[2]!)?.[1] ?? "");
        }
        if (idx >= 0) cells[idx] = value;
      }
      if (cells.some((v) => v && v.trim())) table.push(cells.map((v) => v ?? ""));
    }
    bodyText += table.map((r) => r.join(" ")).join("\n") + "\n";
    rows = rowsFromTable(table, warnings);
    if (rows.length) break;
  }
  if (!rows.length && !warnings.length) warnings.push("No sheet with Project / Status / Update columns was found.");
  return { ...metaFromText(bodyText), rows, warnings };
}

// ── PDF ──────────────────────────────────────────────────────────────────────────────
interface PdfItem {
  str: string;
  x: number;
  y: number;
}

/** Group positioned text into lines (by y) and columns (by the header's x positions). Pure. */
export function tableFromPdfItems(items: PdfItem[]): string[][] {
  const lines = new Map<number, PdfItem[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const key = Math.round(it.y / 3) * 3;
    lines.set(key, [...(lines.get(key) ?? []), it]);
  }
  const ordered = [...lines.entries()].sort(([a], [b]) => b - a).map(([, its]) => its.sort((a, b) => a.x - b.x));
  const headerLine = ordered.find((its) => isHeader(its.map((i) => i.str)));
  if (!headerLine) return ordered.map((its) => [its.map((i) => i.str).join(" ")]);
  const starts = headerLine.map((i) => i.x);
  const colOf = (x: number) => {
    let c = 0;
    for (let i = 1; i < starts.length; i++) if (x >= starts[i]! - 2) c = i;
    return c;
  };
  const statusCol = headerLine.findIndex((i) => /status|rag/i.test(i.str));
  const table: string[][] = [];
  let current: string[] | null = null;
  for (const its of ordered.slice(ordered.indexOf(headerLine))) {
    const cells: string[] = new Array(starts.length).fill("");
    for (const i of its) cells[colOf(i.x)] += (cells[colOf(i.x)] ? " " : "") + i.str;
    // A row starts where the status column carries a RAG; every other line (wrapped text,
    // the "CODE · PM" line under a project name, a "computed" tag) continues the row above.
    // Without a status column, an empty first column marks the continuation instead.
    const startsRow = current === null || (statusCol >= 0 ? normaliseStatus(cells[statusCol] ?? "") !== null : Boolean(cells[0]!.trim()));
    if (current && !startsRow) {
      cells.forEach((v, i) => {
        if (v) current![i] = (current![i] ? current![i] + "\n" : "") + v;
      });
    } else {
      if (current) table.push(current);
      current = cells;
    }
  }
  if (current) table.push(current);
  return table;
}

export async function parsePdf(buf: Buffer): Promise<ParsedReport> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true });
  const doc = await task.promise;
  const items: PdfItem[] = [];
  let text = "";
  for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const offset = -p * 10_000; // keep pages in order when sorting by y descending
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const tx = raw.transform as number[];
      items.push({ str: raw.str, x: tx[4]!, y: tx[5]! + offset });
      text += raw.str + (raw.hasEOL ? "\n" : " ");
    }
  }
  await task.destroy();
  const warnings: string[] = [];
  const rows = rowsFromTable(tableFromPdfItems(items), warnings);
  if (!rows.length && !warnings.length) warnings.push("No Project / Status / Update table could be read from the PDF — check the rows carefully or upload the Word file.");
  return { ...metaFromText(squash(text)), rows, warnings };
}

export async function extractStatusReport(buf: Buffer, fileName: string): Promise<ParsedReport & { format: ReportFormat }> {
  if (buf.length > FILE_MAX_BYTES) throw new ParseError("The file is larger than 5 MB.");
  const format = detectFormat(fileName, buf);
  const report = format === "docx" ? parseDocx(buf) : format === "xlsx" ? parseXlsx(buf) : await parsePdf(buf);
  return { ...report, format };
}

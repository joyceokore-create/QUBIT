import "server-only";
import { readZip, ZipError } from "@/lib/zip-read";
import type { Rag } from "@/server/health";
import type { ParsedCell, ParsedGate } from "@/lib/status-report-delivery";

/**
 * Status-report upload — turn Riverbank's weekly "Project Status Report" (Word, Excel or
 * PDF; one row per project: Project · Status · Stage · Update and Outlook — or a PowerPoint
 * one-pager per project: title, headline, overall RAG, "Where we are") into rows the
 * PM reviews. A PowerPoint slide is read by GEOMETRY as well as text: the "Where we are"
 * stages, a channels-by-market grid (LIVE / UAT / N/A cells under module headers beside
 * market headers), a per-market list under a section banner, dimension pills and the
 * text sections (Done · Progress · Risks · Next steps · Decisions) all come out
 * structured, so the review can turn them into gate and module states and the update. Parsing is tolerant: the table is found by its header, text split across
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
  /** PowerPoint only — what the slide says about delivery (empty for table formats). */
  gates: ParsedGate[];
  cells: ParsedCell[];
  /** "REQUIREMENTS · Amber" pills, as read. */
  dimensions: { name: string; value: string }[];
  /** Text blocks under a heading (Done, Risks & issues, Next steps …), one line per bullet. */
  sections: { title: string; lines: string[] }[];
}

/** The structured fields a table row never has. */
export const NO_SLIDE = { gates: [] as ParsedGate[], cells: [] as ParsedCell[], dimensions: [] as { name: string; value: string }[], sections: [] as { title: string; lines: string[] }[] };

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

export type ReportFormat = "docx" | "xlsx" | "pdf" | "pptx";

export function detectFormat(fileName: string, buf: Buffer): ReportFormat {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (ext === "docx" && isZip) return "docx";
  if (ext === "xlsx" && isZip) return "xlsx";
  if (ext === "pptx" && isZip) return "pptx";
  if (ext === "pdf" && isPdf) return "pdf";
  if (isPdf) return "pdf";
  if (isZip) throw new ParseError("That file is a ZIP container but not a .docx, .xlsx or .pptx — rename it or export it again.");
  throw new ParseError("Upload the status report as Word (.docx), Excel (.xlsx), PowerPoint (.pptx) or PDF.");
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
    rows.push({ line: headerAt + 2 + i, project, status, statusRaw, stage, update, warnings: w, ...NO_SLIDE });
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

// ── PowerPoint ───────────────────────────────────────────────────────────────────────
interface Shape {
  idx: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  text: string;
}

/** Every text-bearing shape with its position in points (EMU / 12700), in document order. */
function slideShapes(xml: string): Shape[] {
  const out: Shape[] = [];
  let idx = 0;
  for (const m of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const blk = m[0];
    const lines = blk
      .split(/<\/a:p>/)
      .map((p) => squash([...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => unescape(t[1]!)).join("")))
      .filter(Boolean);
    if (!lines.length) continue;
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(blk);
    const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(blk);
    out.push({
      idx: idx++,
      x: off ? Number(off[1]) / 12700 : -1,
      y: off ? Number(off[2]) / 12700 : -1,
      w: ext ? Number(ext[1]) / 12700 : 0,
      h: ext ? Number(ext[2]) / 12700 : 0,
      lines,
      text: lines.join(" // "),
    });
  }
  return out;
}

const RAG_LINE = /^(?:overall(?:\s+status)?\s*[:·-]\s*)?(green|amber|red)\b\s*$/i;
const META_LINE = /^(report date|as at|pm:|sponsor:|prepared by|status key|project status report)/i;
const STAGE_ITEM = /^\d+\s*[·.\-–]\s*([A-Z][A-Z /-]{2,})$/;
const STAGE_DONE = /^(complete|completed|released|done|live)$/i;
/** A state cell: LIVE · UAT · N/A · BUILD … optionally followed by "| note". */
const STATE_CELL = /^(live|uat|n\/?a|not applicable|not in scope|build|in build|dev|development|planned|planning|pilot|sit|testing|not yet live|not started|in progress|blocked|done|complete|completed|released|in uat|in sit|deployed|in production|scheduled)\b\s*(?:[|·—–-]\s*(.+))?$/i;
const DIMENSION_VALUE = /^(green|amber|red|watch|on track|at risk|off track|needs attention)$/i;
const SECTION_TITLE = /^(done|achievements|highlights|progress(?: to date)?|key risks|risks?(?:\s*&\s*issues)?|issues|blockers|next steps?(?:\s*&\s*decisions)?|decisions?(?:\s*(?:&|and)\s*support needed)?|decision required|decisions required|top risk|workstreams|support needed|asks?)$/i;

const overlapX = (a: Shape, b: Shape) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
const sameRow = (a: Shape, b: Shape) => Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= Math.max(a.h, b.h) / 2;

/**
 * The slide, read by position: state cells with the header above (walking up through the
 * cells of the same column) and the header to the left (walking left through the cells of
 * the same row); dimension pills; headed text sections spanning to the next title on the
 * same row and stopping at the next title below.
 */
function slideStructure(shapes: Shape[], slideWidth: number, titleIdx: number) {
  const isCell = (s: Shape) => s.lines.length === 1 && s.w > 0 && s.w <= 300 && s.h <= 45 && STATE_CELL.test(s.text) && !SECTION_TITLE.test(s.text);
  const isTitle = (s: Shape) => s.lines.length === 1 && SECTION_TITLE.test(s.text);
  const unusable = (s: Shape) => s.idx <= titleIdx || RAG_LINE.test(s.text) || META_LINE.test(s.text) || DIMENSION_VALUE.test(s.text);
  const positioned = shapes.filter((s) => s.x >= 0);

  const cells: ParsedCell[] = [];
  for (const c of positioned) {
    if (!isCell(c)) continue;
    // Column header: the nearest shape above with half the width in common, skipping cells.
    const above = positioned.filter((s) => s !== c && s.y + s.h <= c.y + 2 && overlapX(s, c) >= Math.min(s.w, c.w) * 0.5).sort((a, b) => b.y + b.h - (a.y + a.h));
    let column: string | null = null;
    let prev: Shape = c;
    for (const s of above) {
      if (prev.y - (s.y + s.h) > 60) break;
      if (isCell(s)) {
        prev = s;
        continue;
      }
      if (!unusable(s) && s.lines.length === 1 && s.text.length <= 48) column = s.lines[0]!;
      break;
    }
    // Row header: the nearest shape to the left on the same row, skipping cells.
    const left = positioned.filter((s) => s !== c && s.x + s.w <= c.x + 2 && sameRow(s, c)).sort((a, b) => b.x + b.w - (a.x + a.w));
    let row: string | null = null;
    prev = c;
    for (const s of left) {
      if (prev.x - (s.x + s.w) > 60) break;
      if (isCell(s)) {
        prev = s;
        continue;
      }
      if (!unusable(s) && s.lines.length === 1 && !isTitle(s) && s.text.length <= 48) row = s.lines[0]!;
      break;
    }
    if (!column && !row) continue;
    const m = c.text.match(STATE_CELL)!;
    cells.push({ column, row, stateRaw: m[1]!, note: m[2] ? squash(m[2]) : null });
  }

  const dimensions: { name: string; value: string }[] = [];
  for (const v of positioned) {
    if (v.lines.length !== 1 || !DIMENSION_VALUE.test(v.text)) continue;
    const label = positioned.find((s) => s !== v && s.lines.length === 1 && Math.abs(s.x - v.x) <= 4 && v.y - (s.y + s.h) <= 8 && v.y >= s.y && s.text === s.text.toUpperCase() && /[A-Z]{3,}/.test(s.text) && !STAGE_ITEM.test(s.text));
    if (label) dimensions.push({ name: label.text.charAt(0) + label.text.slice(1).toLowerCase(), value: v.text });
  }

  const titles = positioned.filter(isTitle).sort((a, b) => a.y - b.y || a.x - b.x);
  const sections: { title: string; lines: string[] }[] = [];
  for (const t of titles) {
    const right = titles.filter((o) => o !== t && sameRow(o, t) && o.x > t.x).sort((a, b) => a.x - b.x)[0];
    const xEnd = right ? right.x : Math.max(slideWidth, t.x + t.w);
    const below = titles.filter((o) => o !== t && o.y >= t.y + t.h && o.x < xEnd && o.x + o.w > t.x).sort((a, b) => a.y - b.y)[0];
    const yEnd = below ? below.y : Number.POSITIVE_INFINITY;
    const body = positioned
      .filter((s) => s !== t && !isTitle(s) && !isCell(s) && s.y >= t.y + t.h - 2 && s.y < yEnd - 4 && s.x >= t.x - 4 && s.x < xEnd && !unusable(s))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = body.flatMap((s) => s.lines).map((l) => l.replace(/^[✓✔•·\-–]\s*/, "").trim()).filter(Boolean);
    if (lines.length) sections.push({ title: t.text.charAt(0) + t.text.slice(1).toLowerCase(), lines });
  }
  return { cells, dimensions, sections };
}

/**
 * One project per slide: the title (the first line, or the line after "PROJECT STATUS
 * REPORT"), the overall RAG (the first standalone GREEN/AMBER/RED or "Overall status:
 * …"), the headline sentence as the update (plus an "Overall: …" line when present),
 * the "Where we are" items as gates (the first in-flight one doubles as the stage), and —
 * by position — the state cells, dimension pills and headed text sections.
 */
export function parsePptx(buf: Buffer): ParsedReport {
  let entries;
  try {
    entries = readZip(buf);
  } catch (e) {
    if (e instanceof ZipError) throw new ParseError(`Could not open the PowerPoint file: ${e.message}`);
    throw e;
  }
  const slides = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]));
  if (!slides.length) throw new ParseError("Not a PowerPoint deck (no slides found).");
  const pres = entries.get("ppt/presentation.xml")?.read().toString("utf8") ?? "";
  const slideWidth = Number(/<p:sldSz[^>]*\bcx="(\d+)"/.exec(pres)?.[1] ?? 0) / 12700 || 960;
  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  let preparedBy: string | null = null;
  let reportDate: string | null = null;
  slides.forEach((name, i) => {
    const shapes = slideShapes(entries.get(name)!.read().toString("utf8"));
    const lines = shapes.flatMap((s) => s.lines);
    if (!lines.length) return;
    let t = 0;
    if (/^project status report$/i.test(lines[0]!)) t = 1;
    const project = lines[t]?.replace(/\s*[|·].*$/, "").trim() ?? "";
    if (!project) return;
    const titleIdx = shapes.findIndex((s) => s.lines.includes(lines[t]!));
    const rest = lines.slice(t + 1);
    const ragIdx = rest.findIndex((l) => RAG_LINE.test(l));
    const status = ragIdx >= 0 ? normaliseStatus(rest[ragIdx]!.match(RAG_LINE)![1]!) : null;
    // The headline: a real sentence (eight words or more, ending in a full stop, or a
    // "Focus now: …" line) beats any other long line — a KPI tile's market list is not it.
    const prose = (l: string, j: number) => j !== ragIdx && !META_LINE.test(l) && !RAG_LINE.test(l) && /[a-z]/.test(l) && !/\|/.test(l);
    const headline =
      rest.find((l, j) => prose(l, j) && l.split(/\s+/).length >= 8 && (/[.!?]$/.test(l) || /^focus now\s*:/i.test(l))) ??
      rest.find((l, j) => prose(l, j) && l.length >= 25);
    const overall = rest.find((l) => /^overall\s*:/i.test(l) && !RAG_LINE.test(l));
    const w: string[] = [];
    let update = [headline, overall].filter(Boolean).join(" ");
    if (!update) {
      update = rest.filter((l) => !META_LINE.test(l) && !RAG_LINE.test(l)).slice(0, 2).join(" ");
      w.push("No headline sentence found — the first lines of the slide were used.");
    }
    if (update.length > NARRATIVE_MAX) {
      update = update.slice(0, NARRATIVE_MAX - 1).trimEnd() + "…";
      w.push(`Update shortened to ${NARRATIVE_MAX} characters.`);
    }
    // "Where we are": "2 · IN REVIEW" then the item's name, then (optionally) its note.
    const gates: ParsedGate[] = [];
    let stage = "";
    for (let j = 0; j < rest.length - 1; j++) {
      const m = rest[j]!.match(STAGE_ITEM);
      if (!m) continue;
      const gname = rest[j + 1]!.replace(/\s*[|·].*$/, "").trim();
      const after = rest[j + 2];
      const note = after && !STAGE_ITEM.test(after) && !SECTION_TITLE.test(after) && !RAG_LINE.test(after) ? after : "";
      gates.push({ name: gname, stateRaw: m[1]!.trim(), note });
      if (!stage && !STAGE_DONE.test(m[1]!.trim())) stage = `${gname} · ${m[1]!.trim().toLowerCase()}`.slice(0, STAGE_MAX);
    }
    if (!status) w.push("No overall RAG found on the slide — pick one.");
    for (const l of rest) {
      const d = l.match(/^(?:report date|as at)\s*[:]?\s*(.+)$/i);
      if (d && !reportDate) reportDate = d[1]!.replace(/\s*\|.*$/, "").trim();
      const p = l.match(/^(?:prepared by|pm)\s*:\s*([^·|]+)/i);
      if (p && !preparedBy && !/\[name\]/i.test(p[1]!)) preparedBy = p[1]!.trim();
      const a = l.match(/\bas at\s+([0-9][^|]+)/i);
      if (a && !reportDate) reportDate = a[1]!.trim();
    }
    const structure = slideStructure(shapes, slideWidth, titleIdx);
    rows.push({ line: i + 1, project, status, statusRaw: ragIdx >= 0 ? rest[ragIdx]! : "", stage, update, warnings: w, gates, ...structure });
  });
  if (!rows.length) warnings.push("No slide with a project title was found.");
  return { preparedBy, reportDate, rows, warnings };
}

export async function extractStatusReport(buf: Buffer, fileName: string): Promise<ParsedReport & { format: ReportFormat }> {
  if (buf.length > FILE_MAX_BYTES) throw new ParseError("The file is larger than 5 MB.");
  const format = detectFormat(fileName, buf);
  const report = format === "docx" ? parseDocx(buf) : format === "xlsx" ? parseXlsx(buf) : format === "pptx" ? parsePptx(buf) : await parsePdf(buf);
  return { ...report, format };
}

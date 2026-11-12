import { QUBIT_LOGO_SVG } from "@/server/pdf/brand";
import { esc, footerTemplate, labDocument, printSpec, safeColor, stamp, zoneLabel, type Orientation, type Tone } from "@/server/pdf/shell";
import { healthKey, healthWord, type HealthKey } from "@/lib/status-words";
import type { RenderPdfOptions } from "@/server/pdf/render";

/**
 * UX plan D14 — the building blocks of the "lab report" PDF layout. Every template is the
 * same sequence, assembled by labReport():
 *
 *   header → notice → summary panels → counted sections → (Chromium) footer
 *
 * Pure functions: text in, markup out. Every string parameter is TEXT and is escaped here;
 * the only way to pass markup into a block is a `RawHtml` made by another block (raw()),
 * so a person's text can never be interpolated unescaped.
 */

/** Markup produced by a block — passes through a table cell or status value unescaped. */
export interface RawHtml {
  readonly html: string;
}
export const raw = (html: string): RawHtml => ({ html });
const isRaw = (v: unknown): v is RawHtml => typeof v === "object" && v !== null && "html" in v;

/** A table cell / panel value: text (escaped), a number, a block's markup, or empty (—). */
export type Cell = string | number | RawHtml | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined || v === "") return `<span class="nil">—</span>`;
  if (isRaw(v)) return v.html;
  return esc(String(v));
}

// ── Status words (U4: always a symbol and a word, never colour alone) ──────────────────

export type MarkerKind = "done" | "warn" | "progress" | "todo";

export const MARKER: Record<MarkerKind, { sym: string; word: string; tone: Tone }> = {
  done: { sym: "✓", word: "Done", tone: "ok" },
  warn: { sym: "!", word: "Needs attention", tone: "warn" },
  progress: { sym: "◐", word: "In progress", tone: "info" },
  todo: { sym: "–", word: "Not started", tone: "muted" },
};

/** ✓ Done / ! Missing / ◐ In progress / – Not started — the word defaults per kind. */
export function statusMarker(kind: MarkerKind, word?: string): RawHtml {
  const m = MARKER[kind];
  return raw(`<span class="st tone-${m.tone}"><span class="sym" aria-hidden="true">${m.sym}</span>${esc(word ?? m.word)}</span>`);
}

const HEALTH_TONE: Record<HealthKey, Tone> = { ok: "ok", warn: "warn", bad: "bad" };

/** Any RAG-ish value → "On track" / "At risk" / "Off track" as a coloured word; unknown or
 * unrated → grey "Not rated". */
export function health(value: string | null | undefined): RawHtml {
  const k = healthKey(value);
  return toneWord(healthWord(value), k ? HEALTH_TONE[k] : "muted");
}

export function toneWord(word: string, tone: Tone): RawHtml {
  return raw(`<span class="st tone-${tone}">${esc(word)}</span>`);
}

/** Enum words that are statuses get their marker; anything else stays plain text. Used by the
 * data table, whose columns are only known at run time. */
export function statusCell(value: string): Cell {
  if (healthKey(value)) return health(value);
  switch (value) {
    case "Completed":
    case "Done":
      return statusMarker("done", value);
    case "InProgress":
      return statusMarker("progress", "In progress");
    case "Blocked":
      return statusMarker("warn", "Blocked");
    case "NotStarted":
      return statusMarker("todo", "Not started");
    default:
      return value;
  }
}

// ── Blocks ─────────────────────────────────────────────────────────────────────────────

/** QUBIT logo │ title (+ optional subtitle) on the left; "Report Date" + date/time right. */
export function header(title: string, reportDate: string, subtitle?: string | null): string {
  return `<header class="hd"><div class="hd-l"><span class="hd-logo">${QUBIT_LOGO_SVG}</span><span class="hd-bar"></span><div style="min-width:0"><div class="hd-title">${esc(title)}</div>${
    subtitle ? `<div class="hd-sub">${esc(subtitle)}</div>` : ""
  }</div></div><div class="hd-r"><div class="hd-k">Report Date</div><div class="hd-v">${esc(reportDate)}</div></div></header>`;
}

export interface Notice {
  /** "attention" leads with a bold label ("Needs a decision:"); "confidential" is the default line. */
  kind: "attention" | "confidential";
  text: string;
  label?: string;
}

export const confidential = (tenantName: string): Notice => ({ kind: "confidential", text: `Confidential — for ${tenantName} internal use.` });

/** One line in a thin brand-coloured outline. */
export function notice(n: Notice, brandColor: string): string {
  return `<div class="notice" role="note" style="border-color:${safeColor(brandColor)};color:${safeColor(brandColor)}">${n.label ? `<b>${esc(n.label)}</b> ` : ""}${esc(n.text)}</div>`;
}

export interface StatusItem {
  label: string;
  value: Cell;
  /** Colours a plain-text value (e.g. a count); block markup carries its own colour. */
  tone?: Tone;
}

/** Status grid columns: one column up to 3 items, two beyond. */
export const statusColumns = (n: number): 1 | 2 => (n > 3 ? 2 : 1);

/** Two grey panels side by side: key-value information on the left, a status grid on the right. */
export function summaryPanels(info: { title: string; rows: [string, Cell][] }, status: { title: string; items: StatusItem[] }): string {
  const rows = info.rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${cell(v)}</td></tr>`).join("");
  const items = status.items
    .map((s) => {
      const v = s.tone && !isRaw(s.value) ? `<span class="st tone-${s.tone}">${cell(s.value)}</span>` : cell(s.value);
      return `<div class="gi"><span class="k">${esc(s.label)}</span><span class="v">${v}</span></div>`;
    })
    .join("");
  return `<div class="panels"><div class="panel"><div class="panel-t">${esc(info.title)}</div><table class="kv"><tbody>${rows}</tbody></table></div><div class="panel"><div class="panel-t">${esc(status.title)}</div><div class="grid" style="grid-template-columns:repeat(${statusColumns(status.items.length)},1fr)">${items}</div></div></div>`;
}

/** "Name (N)" + body, or a grey "None" box when the section is empty. `count: null` is a
 * prose section (no count); its body is still replaced by "None" when absent. */
export function section(title: string, count: number | null, body: string | null): string {
  const empty = body === null || count === 0;
  return `<section class="sec"><h2 class="sec-t">${esc(title)}${count === null ? "" : ` (${count})`}</h2>${empty ? `<div class="none">None</div>` : body}</section>`;
}

export interface Column {
  label: string;
  width?: string;
  align?: "right";
}

/** A row of cells, or a group heading row (e.g. a portfolio) spanning the table. */
export type Row = Cell[] | { group: string };

/** A plain table: rules only, no fills; colour only on status words inside the cells. */
export function table(columns: Column[], rows: Row[]): string {
  const cls = (c: Column | undefined) => (c?.align === "right" ? ` class="r"` : "");
  const head = columns.map((c) => `<th${cls(c)}${c.width ? ` style="width:${esc(c.width)}"` : ""}>${esc(c.label)}</th>`).join("");
  const body = rows
    .map((r) =>
      Array.isArray(r)
        ? `<tr>${r.map((v, i) => `<td${cls(columns[i])}>${cell(v)}</td>`).join("")}</tr>`
        : `<tr><td class="g" colspan="${columns.length}">${esc(r.group)}</td></tr>`,
    )
    .join("");
  return `<table class="t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A primary line with a grey second line beneath it, for one table cell. */
export function stacked(main: string, sub: string | null | undefined): RawHtml {
  return raw(`${esc(main)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}`);
}

export function bullets(items: string[]): string {
  return `<ul class="ul">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

export function prose(text: string): string {
  return `<p class="prose">${esc(text)}</p>`;
}

/** The footer as Chromium draws it on every page: source + "as of" (tenant time) left, page chip right. */
export function footer(source: string, asOf: Date, timeZone: string): string {
  return footerTemplate(source, `${stamp(asOf, timeZone)} ${zoneLabel(timeZone)}`);
}

// ── The one layout ─────────────────────────────────────────────────────────────────────

export interface LabReport {
  /** The document <title>. */
  docTitle: string;
  orientation: Orientation;
  tenantName: string;
  brandColor: string;
  timeZone: string;
  title: string;
  subtitle?: string | null;
  generatedAt: Date;
  /** The single thing that needs attention; null → the confidentiality line. */
  attention: Notice | null;
  info: { title: string; rows: [string, Cell][] };
  status: { title: string; items: StatusItem[] };
  /** Pre-rendered section() blocks, in order. */
  sections: string[];
  /** Left footer line, before "As of …". */
  source: string;
}

/** Header → notice → panels → sections, plus the footer spec. When the notice is spent on an
 * attention item, the confidentiality line moves into the footer so it is never lost. */
export function labReport(r: LabReport): { html: string; spec: RenderPdfOptions } {
  const n = r.attention ?? confidential(r.tenantName);
  const body = [
    header(r.title, stamp(r.generatedAt, r.timeZone), r.subtitle),
    notice(n, r.brandColor),
    summaryPanels(r.info, r.status),
    ...r.sections,
  ].join("");
  const source = r.attention ? `Confidential — ${r.tenantName} internal use · ${r.source}` : r.source;
  return { html: labDocument(r.docTitle, r.orientation, body), spec: printSpec(r.orientation, footer(source, r.generatedAt, r.timeZone)) };
}

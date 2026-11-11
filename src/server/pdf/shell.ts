import { PRINT_FONT } from "@/server/pdf/brand";
import { formatDate, formatTime, DEFAULT_TIME_ZONE } from "@/lib/dates";
import type { RenderPdfOptions } from "@/server/pdf/render";

/**
 * UX plan D14 — the print shell every template renders into: one "lab report" layout on A4,
 * landscape or portrait. Every document flows (Chromium paginates it) and gets Chromium's
 * footer on every page: source + "as of" on the left, a grey "1 of 2" chip on the right.
 * Neutral greys; the tenant's brand colour is used for the notice outline only; colour
 * otherwise appears only on status words. No external resource of any kind: one inline
 * <style>, system fonts, an inline SVG logo.
 *
 * The blocks that fill a page live in blocks.ts; this file owns escaping, the palette, the
 * page geometry and the document/footer wrappers.
 */

export const esc = (s: string | null | undefined): string =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The print palette. Greys for everything structural; the tone colours appear on status
 * words only (U4: always alongside a symbol or a word, never colour alone). */
export const INK = { text: "#231f20", body: "#2b2b2b", muted: "#6b6b6b", faint: "#9f9f9f", rule: "#d9d9d9", hair: "#ececec", panel: "#f3f3f3" } as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";
export const TONE: Record<Tone, string> = { ok: "#15803d", warn: "#b45309", bad: "#b91c1c", info: "#1d4ed8", muted: "#6b6b6b" };

/** Riverbank red — only the fallback when a tenant's stored brand colour is unusable. */
export const RIVERBANK_RED = "#ED1C24";

/** A tenant brand colour is data, and it lands inside a style attribute: accept only a hex
 * colour so it can never carry extra CSS. */
export function safeColor(c: string | null | undefined, fallback = RIVERBANK_RED): string {
  return c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) ? c : fallback;
}

export type Orientation = "landscape" | "portrait";

/** A4 margins — the @page rule and Chromium's footer area must agree (render.ts). */
export const PAGE_MARGIN = { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" };

/** "11 Nov 2026, 14:05" in the tenant's zone. */
export function stamp(d: Date, tz: string = DEFAULT_TIME_ZONE): string {
  return `${formatDate(d, tz)}, ${formatTime(d, tz)}`;
}

/** "Nairobi time" for Africa/Nairobi; any other IANA zone by its city. */
export function zoneLabel(tz: string = DEFAULT_TIME_ZONE): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ");
  return city && city !== tz ? `${city} time` : tz;
}

const css = (orientation: Orientation) => `
  @page { size: A4 ${orientation}; margin: ${PAGE_MARGIN.top} ${PAGE_MARGIN.right} ${PAGE_MARGIN.bottom} ${PAGE_MARGIN.left}; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${PRINT_FONT}; color: ${INK.text}; font-size: 10.5px; line-height: 1.4; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; font-variant-numeric: tabular-nums; }
  * { box-sizing: border-box; }
  p { margin: 0; }
  .doc { display: flex; flex-direction: column; gap: 12px; }

  .hd { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 10px; border-bottom: 1px solid ${INK.rule}; }
  .hd-l { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .hd-logo { display: inline-block; height: 22px; width: 72px; flex: none; }
  .hd-logo svg { height: 100%; width: 100%; display: block; }
  .hd-bar { width: 1px; align-self: stretch; background: ${INK.rule}; flex: none; }
  .hd-title { font-size: 17px; font-weight: 700; line-height: 1.2; letter-spacing: -.005em; }
  .hd-sub { font-size: 10.5px; color: ${INK.muted}; margin-top: 1px; }
  .hd-r { text-align: right; flex: none; }
  .hd-k { font-size: 9px; font-weight: 600; color: ${INK.muted}; text-transform: uppercase; letter-spacing: .06em; }
  .hd-v { font-size: 11px; font-weight: 600; margin-top: 1px; }

  .notice { border: 1px solid; border-radius: 4px; padding: 6px 10px; font-size: 10.5px; color: ${INK.text}; }
  .notice b { font-weight: 700; }

  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; break-inside: avoid; }
  .panel { background: ${INK.panel}; border-radius: 6px; padding: 10px 12px; min-width: 0; }
  .panel-t { font-size: 10px; font-weight: 700; color: ${INK.text}; margin-bottom: 6px; }
  .kv { width: 100%; border-collapse: collapse; }
  .kv td { padding: 2px 0; vertical-align: top; }
  .kv td.k { color: ${INK.muted}; width: 38%; padding-right: 10px; }
  .kv td.v { color: ${INK.text}; font-weight: 500; }
  .grid { display: grid; column-gap: 18px; row-gap: 3px; }
  .gi { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; min-width: 0; }
  .gi .k { color: ${INK.muted}; }
  .gi .v { font-weight: 600; text-align: right; }

  .sec { break-inside: auto; }
  .sec-t { font-size: 11.5px; font-weight: 700; margin: 0 0 5px; break-after: avoid; }
  .none { background: ${INK.panel}; border-radius: 4px; padding: 6px 10px; color: ${INK.muted}; }
  .prose { color: ${INK.body}; line-height: 1.5; }
  .ul { margin: 0; padding-left: 16px; color: ${INK.body}; }
  .ul li { padding: 1px 0; }

  .t { width: 100%; border-collapse: collapse; }
  .t th { text-align: left; font-size: 9.5px; font-weight: 600; color: ${INK.muted}; padding: 4px 8px 4px 0; border-bottom: 1px solid ${INK.text}; white-space: nowrap; }
  .t td { padding: 4px 8px 4px 0; border-bottom: 1px solid ${INK.hair}; vertical-align: top; color: ${INK.body}; overflow-wrap: anywhere; }
  .t th.r, .t td.r { text-align: right; }
  .t td.g { padding-top: 8px; font-size: 9.5px; font-weight: 700; color: ${INK.muted}; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid ${INK.rule}; }
  .t .sub { display: block; font-size: 9.5px; color: ${INK.muted}; }
  .t .nil { color: ${INK.faint}; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }

  .st { font-weight: 600; white-space: nowrap; }
  .st .sym { display: inline-block; width: 1.1em; text-align: center; font-family: "Noto Sans Symbols 2", "DejaVu Sans", "Segoe UI Symbol", ${PRINT_FONT}; }
  ${(Object.keys(TONE) as Tone[]).map((t) => `.tone-${t} { color: ${TONE[t]}; }`).join("\n  ")}
`;

/** A flowing A4 document. */
export function labDocument(title: string, orientation: Orientation, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css(orientation)}</style></head><body><main class="doc">${body}</main></body></html>`;
}

/** Chromium's footer is its own document: inline styles, explicit font-size, system fonts,
 * and print-color-adjust on the chip or its grey fill is dropped. Chromium fills the
 * pageNumber / totalPages spans per page. */
export function footerTemplate(source: string, asOf: string): string {
  return `<div style="font-family:${PRINT_FONT};font-size:8px;color:${INK.muted};width:100%;padding:0 ${PAGE_MARGIN.left};box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:24px"><span>${esc(source)} · As of ${esc(asOf)}</span><span style="flex:none;background:${INK.panel};color:${INK.text};border-radius:999px;padding:2px 9px;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact"><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

export function printSpec(orientation: Orientation, footer: string): RenderPdfOptions {
  return { format: "A4", landscape: orientation === "landscape", footerTemplate: footer, margin: PAGE_MARGIN };
}

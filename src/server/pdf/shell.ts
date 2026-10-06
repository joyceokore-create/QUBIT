import { PRINT_FONT, QUBIT_LOGO_SVG } from "@/server/pdf/brand";
import type { Rag } from "@/server/health";
import type { DimRag } from "@/server/rag-dimensions";

/**
 * Milestone D — the print shell every template renders into. Letter landscape; one-pagers
 * are an explicit page box (11in × 8.5in, overflow hidden, footer inside the page), the
 * digest flows and gets Chromium's footer. Palette is the print palette the mock used —
 * mirrored from the design tokens' light values — plus the tenant's brand colour for the
 * header rule. No external resource of any kind: inline CSS, system fonts, inline SVG.
 */

export const esc = (s: string | null | undefined): string =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const RAG_PRINT: Record<Rag, { bg: string; fg: string; bar: string; label: string }> = {
  Green: { bg: "#dcf1e4", fg: "#0d622c", bar: "#16a34a", label: "Green" },
  Amber: { bg: "#f9ebda", fg: "#824704", bar: "#d97706", label: "Amber" },
  Red: { bg: "#fadede", fg: "#841717", bar: "#dc2626", label: "Red" },
};
const NONE = { bg: "#f3f5f8", fg: "#6b6b6b", bar: "#dadada", label: "—" };

export const ragPrint = (rag: Rag | null | undefined) => (rag ? RAG_PRINT[rag] : NONE);
export const dimPrint = (d: DimRag) => (d === "G" ? RAG_PRINT.Green : d === "A" ? RAG_PRINT.Amber : d === "R" ? RAG_PRINT.Red : NONE);

export const EYEBROW = "font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b";
export const CARD = "border:1px solid #e9e9e9;border-radius:10px;padding:12px 14px";

export function pill(rag: Rag | null | undefined, text?: string): string {
  const p = ragPrint(rag);
  return `<span style="border-radius:999px;background:${p.bg};color:${p.fg};padding:1px 8px;font-size:10.5px;font-weight:700;white-space:nowrap">${esc(text ?? p.label)}</span>`;
}

export function ragTile(label: string, rag: Rag | null, size: "lg" | "sm" = "lg"): string {
  const p = ragPrint(rag);
  const fs = size === "lg" ? 30 : 20;
  return `<div style="border-radius:10px;background:${p.bg};padding:${size === "lg" ? "14px 16px" : "8px 14px"};text-align:center;min-width:${size === "lg" ? 150 : 96}px"><div style="font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${p.fg}">${esc(label)}</div><div style="font-size:${fs}px;font-weight:800;color:${p.fg};line-height:1.1">${esc(rag ? rag.toUpperCase() : "NO CHECK-IN")}</div></div>`;
}

export function list(items: string[], empty: string): string {
  if (items.length === 0) return `<p style="margin:0;color:#9f9f9f;font-style:italic">${esc(empty)}</p>`;
  return `<ul style="margin:0;padding-left:16px;line-height:1.45;color:#2b2b2b">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

export function sectionTitle(text: string, color = "#6b6b6b"): string {
  return `<div style="${EYEBROW};color:${color};margin-bottom:8px">${esc(text)}</div>`;
}

const BASE_CSS = `
  @page { size: Letter landscape; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${PRINT_FONT}; color: #231f20; font-size: 12px; line-height: 1.35;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
  * { box-sizing: border-box; }
  h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -.01em; color: #231f20; }
  p { margin: 0; }
  table { border-collapse: collapse; width: 100%; }
`;

const PAGE_CSS = `
  .page { position: relative; width: 11in; height: 8.5in; overflow: hidden; padding: 34px 40px 52px;
          display: flex; flex-direction: column; gap: 14px; break-after: page; }
  .page:last-child { break-after: auto; }
  .page > .foot { position: absolute; left: 40px; right: 40px; bottom: 22px; display: flex; justify-content: space-between;
                  gap: 24px; font-size: 9.5px; color: #9f9f9f; border-top: 1px solid #e9e9e9; padding-top: 8px; }
`;

const FLOW_CSS = `
  @page { size: Letter landscape; margin: 0.55in 0.5in 0.7in; }
  thead { display: table-header-group; }
  tr, td, th { break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3 { break-after: avoid; }
`;

export const DIGEST_MARGIN = { top: "0.55in", right: "0.5in", bottom: "0.7in", left: "0.5in" };

/** Chromium's footer is its own document: inline styles, explicit font-size, system fonts. */
export function flowFooter(left: string): string {
  return `<div style="font-family:${PRINT_FONT};font-size:8px;color:#9f9f9f;width:100%;padding:0 0.5in;box-sizing:border-box;display:flex;justify-content:space-between;gap:24px"><span>${esc(left)}</span><span>Internal and confidential · Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

export function header(opts: { eyebrow: string; title: string; subtitle: string | null; right: string; brandColor: string }): string {
  return `<header style="display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid ${esc(opts.brandColor)};padding-bottom:12px">
    <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
      <div style="${EYEBROW}">${esc(opts.eyebrow)}</div>
      <h1>${esc(opts.title)}</h1>
      ${opts.subtitle ? `<p style="font-size:13px;color:#4b4b4b;max-width:640px">${esc(opts.subtitle)}</p>` : ""}
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex:none">${opts.right}<span style="display:inline-block;height:24px;width:78px">${QUBIT_LOGO_SVG}</span></div>
  </header>`;
}

/** An explicitly paginated document: each `page` string is one Letter-landscape sheet. */
export function pagedDocument(title: string, pages: string[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${PAGE_CSS}</style></head><body>${pages.map((p) => `<section class="page">${p}</section>`).join("")}</body></html>`;
}

/** A flowing document: Chromium paginates it and draws the footer on every page. */
export function flowingDocument(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${FLOW_CSS}</style></head><body>${body}</body></html>`;
}

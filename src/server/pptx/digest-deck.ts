import "server-only";
import PptxGenJS from "pptxgenjs";
import { formatDate } from "@/lib/dates";
import type { DigestReportData } from "@/server/pdf/report-data";
import { TONE } from "@/server/pdf/shell";

/**
 * The week's roll-up as a PowerPoint deck — the same data and permissions as the digest PDF
 * (buildExport's digest rules, via getDigestReport): a title slide, the Head's managerial
 * summary with the status spread, then the projects by portfolio, 12 to a slide. Built from
 * server data only; nothing is fetched. Colours follow the PDF (tenant brand, status tones).
 */

const RAG_FILL: Record<string, string> = { Green: TONE.ok, Amber: TONE.warn, Red: TONE.bad };
const RAG_WORD: Record<string, string> = { Green: "On track", Amber: "At risk", Red: "Off track" };
const CHECK_IN: Record<string, string> = { Confirmed: "Confirmed", Draft: "Draft", None: "No update" };
const ROWS_PER_SLIDE = 12;
const INK = "231F20";
const MUTED = "6B6B6B";
const hex = (c: string) => c.replace(/^#/, "").toUpperCase();
const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function digestDeckFileName(d: Pick<DigestReportData, "week">): string {
  return `qubit-rollup-${d.week.isoWeek}.pptx`;
}

export async function buildDigestDeck(d: DigestReportData, opts: { timeZone: string }): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in
  pptx.title = `${d.tenantName} portfolio roll-up · Week ${d.week.number}`;
  pptx.company = d.tenantName;
  // Riverbank's brand face, and Microsoft 365's default; Office substitutes where it's missing.
  pptx.theme = { headFontFace: "Aptos", bodyFontFace: "Aptos" };
  const brand = hex(d.brandColor);
  const approved = d.status === "Approved";
  const approval = approved
    ? `Approved by ${d.approvedByName ?? "the Head"}${d.approvedAt ? ` on ${formatDate(d.approvedAt, opts.timeZone)}` : ""}`
    : "Draft — not yet approved by the Head";
  const footer = (s: PptxGenJS.Slide) => {
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: brand }, line: { color: brand } });
    s.addText(`${d.tenantName} · Week ${d.week.number} · ${d.week.range} · ${approved ? "Approved" : "Draft"}`, { x: 0.5, y: 7.05, w: 12.3, h: 0.3, fontSize: 9, color: MUTED });
  };

  // ── 1. title ──
  const title = pptx.addSlide();
  footer(title);
  title.addText("Portfolio roll-up", { x: 0.7, y: 2.2, w: 11.9, h: 0.9, fontSize: 40, bold: true, color: INK });
  title.addText(`Week ${d.week.number} · ${d.week.range}`, { x: 0.7, y: 3.1, w: 11.9, h: 0.6, fontSize: 22, color: brand });
  title.addText(`${d.tenantName} · ${d.total} active project${d.total === 1 ? "" : "s"}`, { x: 0.7, y: 3.8, w: 11.9, h: 0.5, fontSize: 16, color: MUTED });
  title.addText(approval, { x: 0.7, y: 4.4, w: 11.9, h: 0.4, fontSize: 14, color: approved ? TONE.ok.slice(1) : TONE.warn.slice(1) });

  // ── 2. the managerial summary and the status spread ──
  const summary = pptx.addSlide();
  footer(summary);
  summary.addText("Managerial summary", { x: 0.5, y: 0.35, w: 12.3, h: 0.6, fontSize: 26, bold: true, color: INK });
  const lines = (d.narrative ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  summary.addText(
    lines.length ? lines.map((l) => ({ text: l, options: { breakLine: true, paraSpaceAfter: 8 } })) : [{ text: "The Head hasn't written this week's summary yet.", options: { italic: true, color: MUTED } }],
    { x: 0.5, y: 1.1, w: 8.3, h: 5.6, fontSize: 15, color: INK, valign: "top", fit: "shrink" },
  );
  (["Green", "Amber", "Red"] as const).forEach((rag, i) => {
    const y = 1.1 + i * 1.8;
    summary.addShape(pptx.ShapeType.roundRect, { x: 9.3, y, w: 3.5, h: 1.55, fill: { color: hex(RAG_FILL[rag]!) }, line: { color: hex(RAG_FILL[rag]!) }, rectRadius: 0.08 });
    summary.addText(String(d.counts[rag.toLowerCase() as "green" | "amber" | "red"] ?? 0), { x: 9.3, y: y + 0.12, w: 3.5, h: 0.85, fontSize: 40, bold: true, color: "FFFFFF", align: "center" });
    summary.addText(RAG_WORD[rag]!, { x: 9.3, y: y + 0.95, w: 3.5, h: 0.45, fontSize: 14, color: "FFFFFF", align: "center" });
  });

  // ── 3+. the projects, by portfolio, 12 to a slide ──
  const head = ["Code", "Project", "Status", "Update", "PM's line"].map((t) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: INK } } }));
  for (const group of d.groups) {
    for (let at = 0; at < group.rows.length; at += ROWS_PER_SLIDE) {
      const page = group.rows.slice(at, at + ROWS_PER_SLIDE);
      const s = pptx.addSlide();
      footer(s);
      const pages = Math.ceil(group.rows.length / ROWS_PER_SLIDE);
      s.addText(`${group.portfolioName}${pages > 1 ? ` (${at / ROWS_PER_SLIDE + 1} of ${pages})` : ""}`, { x: 0.5, y: 0.3, w: 12.3, h: 0.55, fontSize: 22, bold: true, color: INK });
      const body = page.map((r) => [
        { text: r.code },
        { text: clip(r.name, 60) },
        { text: RAG_WORD[r.rag] ?? r.rag, options: { bold: true, color: "FFFFFF", fill: { color: hex(RAG_FILL[r.rag] ?? TONE.muted) } } },
        { text: CHECK_IN[r.checkIn] ?? r.checkIn },
        { text: clip(r.narrative, 220) || "—" },
      ]);
      s.addTable([head, ...body], { x: 0.5, y: 1.0, w: 12.3, colW: [1.1, 2.9, 1.3, 1.2, 5.8], fontSize: 10, color: INK, border: { type: "solid", pt: 0.5, color: "D9D9D9" }, valign: "middle", autoPage: false });
    }
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

// Status-report upload — the parsers are pure over bytes/XML, so they are pinned without
// Office: a ZIP written in-test round-trips; a Word table split across runs and paragraphs
// comes out as rows; Excel shared strings resolve; PDF items group into a table; names
// match the way PMs write them.
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readZip } from "@/lib/zip-read";
import { matchProject } from "@/server/status-report/match";
import { detectFormat, normaliseStatus, parseDocx, parseXlsx, tableFromPdfItems } from "@/server/status-report/parse";

/** Minimal ZIP writer (local headers + central directory) — enough for the reader to open. */
function zip(files: Record<string, string>, stored = false): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = stored ? raw : deflateRawSync(raw);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(stored ? 0 : 8, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, n);
    offset += local.length + n.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, eocd]);
}

const cell = (...paras: string[]) => `<w:tc>${paras.map((p) => `<w:p>${p}</w:p>`).join("")}</w:tc>`;
const runs = (...t: string[]) => t.map((x) => `<w:r><w:t xml:space="preserve">${x}</w:t></w:r>`).join("");
const docxXml = (rows: string[]) =>
  `<?xml version="1.0"?><w:document><w:body><w:p>${runs("Project Status Report")}</w:p><w:p>${runs("Prepared by: ", "Test PM, Project Manager, Riverbank", " Date: 29 September 2026 Classification: Internal")}</w:p><w:tbl>${rows.join("")}</w:tbl></w:body></w:document>`;
const header = `<w:tr>${cell(runs("Project"))}${cell(runs("Status"))}${cell(runs("Stage"))}${cell(runs("Update and Outlook"))}</w:tr>`;

describe("zip reader", () => {
  it("round-trips stored and deflated entries", () => {
    for (const stored of [true, false]) {
      const z = readZip(zip({ "a/b.xml": "<x>hi &amp; bye</x>", "c.txt": "plain" }, stored));
      expect([...z.keys()]).toEqual(["a/b.xml", "c.txt"]);
      expect(z.get("a/b.xml")!.read().toString()).toBe("<x>hi &amp; bye</x>");
    }
  });
  it("refuses non-archives", () => {
    expect(() => readZip(Buffer.from("not a zip at all, honestly"))).toThrow(/central directory/);
  });
});

describe("parseDocx", () => {
  it("reads the template table: run-split text joined, paragraphs as line breaks, stage note kept, meta from the header", () => {
    const xml = docxXml([
      header,
      `<w:tr>${cell(runs("Fik", "ra"))}${cell(runs("GREEN"))}${cell(runs("UAT / Pilot Readiness"), runs("(internal VAPT in progress)"))}${cell(runs("All stages up to UAT are complete."), runs("UAT Cycle 3 follows."))}</w:tr>`,
      `<w:tr>${cell(runs("Lumi (AI Knowledge Layer)"))}${cell(runs("amber"))}${cell(runs("Evaluation"))}${cell(runs("Prototype complete; progress 20%."))}</w:tr>`,
      `<w:tr>${cell(runs("Mystery"))}${cell(runs("Blue"))}${cell(runs(""))}${cell(runs("x".repeat(600)))}</w:tr>`,
    ]);
    const r = parseDocx(zip({ "word/document.xml": xml }));
    expect(r.preparedBy).toBe("Test PM, Project Manager, Riverbank");
    expect(r.reportDate).toBe("29 September 2026");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ project: "Fikra", status: "Green", stage: "UAT / Pilot Readiness (internal VAPT in progress)", update: "All stages up to UAT are complete.\nUAT Cycle 3 follows.", warnings: [] });
    expect(r.rows[1]).toMatchObject({ project: "Lumi (AI Knowledge Layer)", status: "Amber" });
    expect(r.rows[2]!.status).toBeNull();
    expect(r.rows[2]!.update).toHaveLength(500);
    expect(r.rows[2]!.warnings.join(" ")).toMatch(/isn't Green, Amber or Red/);
    expect(r.rows[2]!.warnings.join(" ")).toMatch(/shortened to 500/);
  });

  it("says so when no status table exists", () => {
    const r = parseDocx(zip({ "word/document.xml": docxXml([`<w:tr>${cell(runs("Name"))}${cell(runs("Owner"))}</w:tr>`]) }));
    expect(r.rows).toEqual([]);
    expect(r.warnings[0]).toMatch(/No table with Project/);
  });
});

describe("parseXlsx", () => {
  it("resolves shared strings and finds the header on any sheet", () => {
    const sst = `<sst><si><t>Project</t></si><si><t>Status</t></si><si><t>Stage</t></si><si><t>Update</t></si><si><t>Sifa</t></si><si><t>GREEN</t></si><si><t>Pilot</t></si><si><r><t>Live, </t></r><r><t>phase 2 underway.</t></r></si></sst>`;
    const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row></sheetData></worksheet>`;
    const r = parseXlsx(zip({ "xl/sharedStrings.xml": sst, "xl/worksheets/sheet1.xml": sheet }));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ project: "Sifa", status: "Green", stage: "Pilot", update: "Live, phase 2 underway." });
  });
});

describe("PDF table grouping", () => {
  it("groups items into lines by y and columns by the header's x, continuing wrapped rows", () => {
    const items = [
      { str: "Project", x: 40, y: 700 },
      { str: "Status", x: 200, y: 700 },
      { str: "Stage", x: 280, y: 700 },
      { str: "Update and Outlook", x: 400, y: 700 },
      { str: "Qora", x: 40, y: 680 },
      { str: "GREEN", x: 200, y: 680 },
      { str: "Documentation", x: 280, y: 680 },
      { str: "ARB approved;", x: 400, y: 680 },
      { str: "docs next.", x: 400, y: 668 },
    ];
    const t = tableFromPdfItems(items);
    expect(t[0]).toEqual(["Project", "Status", "Stage", "Update and Outlook"]);
    expect(t[1]).toEqual(["Qora", "GREEN", "Documentation", "ARB approved;\ndocs next."]);
  });
});

describe("helpers", () => {
  it("normalises statuses and detects formats by extension + magic bytes", () => {
    expect(["GREEN", "g", "On track"].map(normaliseStatus)).toEqual(["Green", "Green", "Green"]);
    expect(["Amber", "yellow", "At risk"].map(normaliseStatus)).toEqual(["Amber", "Amber", "Amber"]);
    expect(["RED", "Off track"].map(normaliseStatus)).toEqual(["Red", "Red"]);
    expect(normaliseStatus("Blue")).toBeNull();
    expect(detectFormat("x.docx", zip({ a: "" }))).toBe("docx");
    expect(detectFormat("x.XLSX", zip({ a: "" }))).toBe("xlsx");
    expect(detectFormat("x.pdf", Buffer.from("%PDF-1.4 ..."))).toBe("pdf");
    expect(() => detectFormat("x.txt", Buffer.from("hello"))).toThrow(/Word/);
  });

  it("matches names exactly, without parentheticals, by code, or suggests on strong overlap", () => {
    const projects = [
      { id: "1", code: "LUMI", name: "Lumi" },
      { id: "2", code: "SWIPE-KE", name: "Swipe Agent Banking — Kenya" },
      { id: "3", code: "QORA", name: "Qora" },
    ];
    expect(matchProject("Lumi (AI Knowledge Layer)", projects)).toEqual({ projectId: "1", confidence: "exact" });
    expect(matchProject("qora", projects)).toEqual({ projectId: "3", confidence: "exact" });
    expect(matchProject("swipe-ke", projects)).toEqual({ projectId: "2", confidence: "exact" });
    expect(matchProject("Swipe Agent Banking Kenya rollout", projects)).toEqual({ projectId: "2", confidence: "suggested" });
    expect(matchProject("Totally Different", projects)).toEqual({ projectId: null, confidence: "none" });
  });
});

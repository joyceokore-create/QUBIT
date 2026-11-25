// @vitest-environment node
// Upload hardening (plan Phase 1): the ZIP reader stops inflating at its caps however the
// archive describes itself (a zip bomb lies about sizes), and the multipart reader refuses
// an oversized body while streaming instead of after buffering it.
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readZip, ZipError, ENTRY_MAX_BYTES } from "@/lib/zip-read";
import { BodyTooLargeError, readFormDataCapped } from "@/lib/body-limit";
import { extractStatusReport, ParseError } from "@/server/status-report/parse";

/** A one-or-more-entry deflate ZIP whose headers may declare a FALSE uncompressed size. */
function zip(files: { name: string; raw: Buffer; declared?: number }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const data = deflateRawSync(f.raw);
    const n = Buffer.from(f.name);
    const size = f.declared ?? f.raw.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(size, 24);
    cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, n);
    offset += local.length + n.length + data.length;
  }
  const cenBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cenBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, eocd]);
}

describe("zip reader caps", () => {
  const zeros = (n: number) => Buffer.alloc(n);

  it("reads an entry under the cap", () => {
    const entries = readZip(zip([{ name: "a.xml", raw: Buffer.from("<ok/>") }]), { entryMax: 1024 });
    expect(entries.get("a.xml")!.read().toString()).toBe("<ok/>");
  });

  it("refuses an entry whose declared size is over the cap before inflating", () => {
    const entry = readZip(zip([{ name: "big.xml", raw: zeros(4096) }]), { entryMax: 1024 }).get("big.xml")!;
    expect(() => entry.read()).toThrow(ZipError);
  });

  it("stops the inflater when the archive lies about the size (zip bomb)", () => {
    // 1 MB of zeros compresses to ~1 KB and claims to be 10 bytes.
    const entry = readZip(zip([{ name: "bomb.xml", raw: zeros(1024 * 1024), declared: 10 }]), { entryMax: 64 * 1024 }).get("bomb.xml")!;
    expect(() => entry.read()).toThrow(/too large/);
  });

  it("caps the archive's total across entries", () => {
    const entries = readZip(
      zip([
        { name: "s1.xml", raw: zeros(600) },
        { name: "s2.xml", raw: zeros(600) },
      ]),
      { entryMax: 1000, totalMax: 1000 },
    );
    expect(entries.get("s1.xml")!.read()).toHaveLength(600);
    expect(() => entries.get("s2.xml")!.read()).toThrow(ZipError);
  });

  it("turns a late sheet hitting the default cap into an unreadable-file error", async () => {
    const bomb = zip([
      { name: "[Content_Types].xml", raw: Buffer.from("<Types/>") },
      { name: "xl/worksheets/sheet1.xml", raw: zeros(ENTRY_MAX_BYTES + 1024), declared: 100 },
    ]);
    expect(bomb.length).toBeLessThan(200 * 1024);
    await expect(extractStatusReport(bomb, "status.xlsx")).rejects.toBeInstanceOf(ParseError);
  });
});

describe("capped multipart body", () => {
  const multipart = (bytes: number, headers: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("file", new File([Buffer.alloc(bytes, 1)], "status.docx"));
    return new Request("http://local/upload", { method: "POST", body: form, headers });
  };

  it("parses a body under the cap", async () => {
    const form = await readFormDataCapped(multipart(1000), 10_000);
    const file = form?.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).size).toBe(1000);
  });

  it("refuses on a declared Content-Length over the cap", async () => {
    await expect(readFormDataCapped(multipart(10, { "content-length": "999999" }), 10_000)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("refuses while streaming when no length is declared", async () => {
    await expect(readFormDataCapped(multipart(50_000), 10_000)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("answers null for a body that isn't multipart", async () => {
    const req = new Request("http://local/upload", { method: "POST", body: "plain", headers: { "content-type": "text/plain" } });
    expect(await readFormDataCapped(req, 10_000)).toBeNull();
  });
});

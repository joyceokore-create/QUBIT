// The ZIP writer behind the Excel template round-trips through the reader the upload uses.
import { describe, expect, it } from "vitest";
import { readZip } from "@/lib/zip-read";
import { crc32, writeZip } from "@/lib/zip-write";

describe("writeZip", () => {
  it("computes CRC-32 and writes entries the reader opens", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    const zip = writeZip({ "a.txt": "hello", "dir/b.xml": Buffer.from("<x/>") });
    const entries = readZip(zip);
    expect([...entries.keys()].sort()).toEqual(["a.txt", "dir/b.xml"]);
    expect(entries.get("a.txt")!.read().toString()).toBe("hello");
    expect(entries.get("dir/b.xml")!.read().toString()).toBe("<x/>");
  });
});

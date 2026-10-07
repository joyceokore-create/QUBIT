import { inflateRawSync } from "node:zlib";

/**
 * A minimal ZIP reader for the Office containers the status-report upload accepts (.docx,
 * .xlsx are ZIPs of XML). Walks the central directory, inflates on demand. Stored (0) and
 * deflate (8) entries only; zip64 and encrypted archives are refused with a clear error —
 * Word and Excel never produce them for files this size. Standard library only.
 */

export interface ZipEntry {
  name: string;
  size: number;
  read(): Buffer;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export function readZip(buf: Buffer): Map<string, ZipEntry> {
  // End of central directory: last 22 bytes + up to 64 KiB of comment.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("Not a ZIP archive (no central directory).");
  const count = buf.readUInt16LE(eocd + 10);
  const cenSize = buf.readUInt32LE(eocd + 12);
  const cenOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cenSize === 0xffffffff || cenOffset === 0xffffffff) throw new ZipError("zip64 archives are not supported.");

  const entries = new Map<string, ZipEntry>();
  let p = cenOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) throw new ZipError("Corrupt central directory.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 0x1) throw new ZipError("Encrypted archives are not supported.");
    if (method !== 0 && method !== 8) throw new ZipError(`Unsupported compression (method ${method}).`);
    entries.set(name, {
      name,
      size,
      read: () => {
        if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOC_SIG) throw new ZipError("Corrupt local header.");
        const ln = buf.readUInt16LE(localOffset + 26);
        const le = buf.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + ln + le;
        const data = buf.subarray(start, start + compressedSize);
        return method === 0 ? Buffer.from(data) : inflateRawSync(data);
      },
    });
  }
  return entries;
}

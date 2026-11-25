import { inflateRawSync } from "node:zlib";

/**
 * A minimal ZIP reader for the Office containers the status-report upload accepts (.docx,
 * .xlsx are ZIPs of XML). Walks the central directory, inflates on demand. Stored (0) and
 * deflate (8) entries only; zip64 and encrypted archives are refused with a clear error —
 * Word and Excel never produce them for files this size. Standard library only.
 *
 * Inflation is CAPPED (zip-bomb guard): one entry may expand to ENTRY_MAX_BYTES and the
 * whole archive, across every read(), to TOTAL_MAX_BYTES. A 5 MB upload can't be made to
 * claim gigabytes of memory — the inflater stops at the cap and the read is refused.
 */

/** One XML part of a 5 MB Office file is a few MB at most; 32 MB is generous. */
export const ENTRY_MAX_BYTES = 32 * 1024 * 1024;
/** Everything read from one archive, summed. */
export const TOTAL_MAX_BYTES = 96 * 1024 * 1024;

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

export function readZip(buf: Buffer, limits: { entryMax?: number; totalMax?: number } = {}): Map<string, ZipEntry> {
  const entryMax = limits.entryMax ?? ENTRY_MAX_BYTES;
  const totalMax = limits.totalMax ?? TOTAL_MAX_BYTES;
  let inflated = 0;
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
        // The declared size is attacker-controlled, so it's only an early refusal; the real
        // bound is maxOutputLength, which stops the inflater itself.
        const budget = Math.min(entryMax, totalMax - inflated);
        if (size > budget) throw new ZipError(`"${name}" is too large to read.`);
        let out: Buffer;
        if (method === 0) {
          if (data.length > budget) throw new ZipError(`"${name}" is too large to read.`);
          out = Buffer.from(data);
        } else {
          try {
            out = inflateRawSync(data, { maxOutputLength: Math.max(1, budget) });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE" || e instanceof RangeError) throw new ZipError(`"${name}" is too large to read.`);
            throw new ZipError(`"${name}" could not be decompressed.`);
          }
        }
        inflated += out.length;
        return out;
      },
    });
  }
  return entries;
}

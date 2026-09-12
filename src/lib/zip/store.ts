/**
 * SpecialCarer — minimal ZIP archive writer (no external dependency)
 *
 * Produces a valid ZIP file from a list of in-memory entries. We only
 * emit STORED (method 0) entries — no compression — which keeps the
 * implementation tiny and deterministic. That is acceptable here: the
 * DSAR erasure bundle for a single subject is a handful of small CSV /
 * JSON files (measured in kilobytes, not megabytes), and it is only
 * ever streamed to a compliance officer's browser one request at a
 * time. Compression would trade code surface for a few kB.
 *
 * The output is a Node `Buffer` and matches the PKZIP spec well enough
 * to round-trip through `unzip`, `Archive Utility.app`, and every
 * major test fixture. We do NOT set Zip64, Unix extra fields, or the
 * data-descriptor bit; entries larger than 4 GB or ambiguous mtimes
 * are out of scope.
 *
 * References:
 *   - APPNOTE.TXT 6.3.10, sections 4.3.7 (local file header),
 *     4.3.12 (central directory), 4.3.16 (end of central directory).
 *
 * Kept dependency-free on purpose: the SpecialCarer server bundle
 * already ships without an archive library, and importing one for a
 * compliance route we hit a handful of times per year would balloon
 * the Vercel cold-start budget.
 */

import { crc32 } from "node:zlib";

export type ZipEntry = {
  /** Path inside the archive. Forward-slash separated. No leading '/'. */
  path: string;
  /** UTF-8 bytes to store. */
  data: Buffer;
  /** Modified time. Defaults to `new Date()` at build time. */
  mtime?: Date;
};

type CentralRecord = {
  path: Buffer;
  crc: number;
  size: number;
  offset: number;
  dosTime: number;
  dosDate: number;
};

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/**
 * Encode a JS Date into the MS-DOS time / date pair used by ZIP.
 * Precision is 2 seconds. Values before 1980 clamp to the epoch.
 */
export function dosDateTime(d: Date): { dosTime: number; dosDate: number } {
  const year = d.getUTCFullYear();
  if (year < 1980) return { dosTime: 0, dosDate: (1 << 5) | 1 };
  const dosTime =
    ((d.getUTCHours() & 0x1f) << 11) |
    ((d.getUTCMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getUTCSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((d.getUTCMonth() + 1) & 0x0f) << 5) |
    (d.getUTCDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Build a complete ZIP archive from the given entries. Entries are
 * written in the order supplied.
 */
export function buildZip(entries: ZipEntry[]): Buffer {
  const now = new Date();
  const chunks: Buffer[] = [];
  const central: CentralRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (entry.path.startsWith("/")) {
      throw new Error(`ZIP entry path must not start with '/': ${entry.path}`);
    }
    const nameBuf = Buffer.from(entry.path, "utf8");
    const data = entry.data;
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(entry.mtime ?? now);

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // general purpose bit flag: UTF-8 name
    local.writeUInt16LE(0, 8); // compression: STORED
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    chunks.push(local, nameBuf, data);
    central.push({
      path: nameBuf,
      crc,
      size: data.length,
      offset,
      dosTime,
      dosDate,
    });
    offset += local.length + nameBuf.length + data.length;
  }

  const centralStart = offset;
  for (const rec of central) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(SIG_CENTRAL, 0);
    header.writeUInt16LE(0x031e, 4); // version made by: UNIX + ZIP 3.0
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8); // UTF-8 flag
    header.writeUInt16LE(0, 10); // compression: STORED
    header.writeUInt16LE(rec.dosTime, 12);
    header.writeUInt16LE(rec.dosDate, 14);
    header.writeUInt32LE(rec.crc, 16);
    header.writeUInt32LE(rec.size, 20);
    header.writeUInt32LE(rec.size, 24);
    header.writeUInt16LE(rec.path.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // comment
    header.writeUInt16LE(0, 34); // disk
    header.writeUInt16LE(0, 36); // internal attrs
    // External attrs: UNIX regular file 0644, packed into the upper
    // 16 bits. Using >>> 0 to coerce to an unsigned 32-bit value —
    // a plain << 16 overflows into a signed negative in JS and blows
    // up writeUInt32LE.
    header.writeUInt32LE(((0o100644 << 16) >>> 0), 38);
    header.writeUInt32LE(rec.offset, 42);

    chunks.push(header, rec.path);
    offset += header.length + rec.path.length;
  }
  const centralSize = offset - centralStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIG_EOCD, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

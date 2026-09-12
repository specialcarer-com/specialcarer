import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { buildZip, dosDateTime } from "./store";

// ----------------------------------------------------------------------
// Round-trip decoder — we don't want to add a `unzip` dep, so here is a
// tiny parser for the subset of ZIP we emit (STORED entries, no Zip64).
// ----------------------------------------------------------------------

function parseZip(buf: Buffer): { name: string; data: Buffer; crc: number }[] {
  const SIG_EOCD = 0x06054b50;
  const SIG_CENTRAL = 0x02014b50;
  const SIG_LOCAL = 0x04034b50;

  // Locate EOCD by scanning backwards. No comment in our writer, so
  // it's at (length - 22), but scan anyway to be robust.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  assert.notEqual(eocd, -1, "EOCD not found");

  const totalEntries = buf.readUInt16LE(eocd + 10);
  const centralStart = buf.readUInt32LE(eocd + 16);

  const entries: { name: string; data: Buffer; crc: number }[] = [];
  let p = centralStart;
  for (let n = 0; n < totalEntries; n++) {
    assert.equal(buf.readUInt32LE(p), SIG_CENTRAL, "bad central sig");
    const compression = buf.readUInt16LE(p + 10);
    assert.equal(compression, 0, "expected STORED");
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    // Follow the local header to get the data.
    assert.equal(buf.readUInt32LE(localOff), SIG_LOCAL, "bad local sig");
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(dataStart, dataStart + size);
    entries.push({ name, data: Buffer.from(data), crc });
  }
  return entries;
}

// ----------------------------------------------------------------------
// dosDateTime
// ----------------------------------------------------------------------

describe("dosDateTime", () => {
  it("encodes a 2020s date correctly", () => {
    const d = new Date(Date.UTC(2026, 4, 15, 13, 45, 30));
    const { dosTime, dosDate } = dosDateTime(d);
    // date: (year-1980)<<9 | month<<5 | day
    assert.equal(dosDate, ((2026 - 1980) << 9) | (5 << 5) | 15);
    // time: hour<<11 | minute<<5 | second/2
    assert.equal(dosTime, (13 << 11) | (45 << 5) | 15);
  });
  it("clamps pre-1980 dates to epoch", () => {
    const d = new Date(Date.UTC(1970, 0, 1));
    const { dosTime, dosDate } = dosDateTime(d);
    assert.equal(dosTime, 0);
    // 1980-01-01
    assert.equal(dosDate, (1 << 5) | 1);
  });
});

// ----------------------------------------------------------------------
// buildZip — happy path
// ----------------------------------------------------------------------

describe("buildZip", () => {
  it("produces a decodable archive with the entries in order", () => {
    const files = [
      { path: "manifest.json", data: Buffer.from(`{"ok":true}\n`, "utf8") },
      { path: "audit.csv", data: Buffer.from("a,b,c\r\n1,2,3\r\n", "utf8") },
      { path: "deferred.csv", data: Buffer.from("id\r\n", "utf8") },
    ];
    const zip = buildZip(files);
    const parsed = parseZip(zip);
    assert.equal(parsed.length, 3);
    assert.deepEqual(
      parsed.map((e) => e.name),
      ["manifest.json", "audit.csv", "deferred.csv"],
    );
    assert.equal(parsed[0].data.toString("utf8"), `{"ok":true}\n`);
    assert.equal(parsed[1].data.toString("utf8"), "a,b,c\r\n1,2,3\r\n");
    assert.equal(parsed[2].data.toString("utf8"), "id\r\n");
  });

  it("writes a correct CRC for each entry", () => {
    const files = [
      { path: "x.txt", data: Buffer.from("hello world", "utf8") },
      { path: "y.txt", data: Buffer.from("goodbye", "utf8") },
    ];
    const zip = buildZip(files);
    const parsed = parseZip(zip);
    for (let i = 0; i < parsed.length; i++) {
      assert.equal(parsed[i].crc, crc32(files[i].data));
    }
  });

  it("handles empty entries", () => {
    const zip = buildZip([{ path: "empty.txt", data: Buffer.alloc(0) }]);
    const parsed = parseZip(zip);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].data.length, 0);
    assert.equal(parsed[0].crc, crc32(Buffer.alloc(0)));
  });

  it("handles zero entries", () => {
    const zip = buildZip([]);
    const parsed = parseZip(zip);
    assert.equal(parsed.length, 0);
    // EOCD is exactly 22 bytes when there is no central dir + no data.
    assert.equal(zip.length, 22);
  });

  it("supports UTF-8 filenames (BMP)", () => {
    const files = [
      { path: "réports/audït.csv", data: Buffer.from("x", "utf8") },
    ];
    const zip = buildZip(files);
    const parsed = parseZip(zip);
    assert.equal(parsed[0].name, "réports/audït.csv");
  });

  it("rejects absolute paths", () => {
    assert.throws(
      () => buildZip([{ path: "/etc/passwd", data: Buffer.alloc(0) }]),
      /must not start with/,
    );
  });
});

/**
 * Tests for the client-side attachment helpers: validation, byte
 * pretty-print, and the per-row preview prefix used in the chat list.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateSelection,
  formatBytes,
  attachmentPreviewPrefix,
  MAX_BYTES,
} from "@/lib/chat/attachments-client";

describe("validateSelection", () => {
  it("accepts an in-range jpeg", () => {
    const r = validateSelection(
      { mime_type: "image/jpeg", size_bytes: 1000 },
      0,
    );
    assert.deepEqual(r, { ok: true });
  });

  it("rejects gif as wrong mime", () => {
    const r = validateSelection({ mime_type: "image/gif", size_bytes: 1000 }, 0);
    assert.deepEqual(r, { ok: false, reason: "mime" });
  });

  it("rejects oversize file", () => {
    const r = validateSelection(
      { mime_type: "image/jpeg", size_bytes: MAX_BYTES + 1 },
      0,
    );
    assert.deepEqual(r, { ok: false, reason: "size" });
  });

  it("rejects zero-byte file as size", () => {
    const r = validateSelection({ mime_type: "image/jpeg", size_bytes: 0 }, 0);
    assert.deepEqual(r, { ok: false, reason: "size" });
  });

  it("rejects when there are already 5 attachments", () => {
    const r = validateSelection(
      { mime_type: "application/pdf", size_bytes: 1000 },
      5,
    );
    assert.deepEqual(r, { ok: false, reason: "count" });
  });
});

describe("formatBytes", () => {
  it("prints bytes for small values", () => {
    assert.equal(formatBytes(512), "512 B");
  });
  it("prints KB for mid values", () => {
    assert.equal(formatBytes(2048), "2 KB");
  });
  it("prints MB for large values", () => {
    assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  });
});

describe("attachmentPreviewPrefix", () => {
  it("returns image prefix when any image attachment is present", () => {
    const out = attachmentPreviewPrefix([
      { mime_type: "image/jpeg" },
      { mime_type: "application/pdf" },
    ]);
    assert.ok(out?.startsWith("\u{1F5BC}"));
  });
  it("returns pdf prefix when only PDFs are present", () => {
    const out = attachmentPreviewPrefix([{ mime_type: "application/pdf" }]);
    assert.ok(out?.startsWith("\u{1F4CE}"));
  });
  it("returns null when no attachments", () => {
    assert.equal(attachmentPreviewPrefix([]), null);
    assert.equal(attachmentPreviewPrefix(null), null);
  });
  it("accepts a flag-bag too", () => {
    assert.ok(
      attachmentPreviewPrefix({ has_image: true })?.startsWith("\u{1F5BC}"),
    );
    assert.ok(
      attachmentPreviewPrefix({ has_pdf: true, has_image: false })?.startsWith(
        "\u{1F4CE}",
      ),
    );
  });
});

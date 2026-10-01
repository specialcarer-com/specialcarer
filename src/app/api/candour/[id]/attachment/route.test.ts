/**
 * Tests for POST /api/candour/[id]/attachment.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleAttachment,
  sanitizeFilename,
  type StorageUploader,
} from "./handler";
import { makeFakeCaseDb, seedEvent } from "../__helpers__/fake-case-db";

const EVENT_ID = "evt_1";

type UploadCall = { path: string; contentType: string; size: number };

function makeStorage(opts: { fail?: boolean } = {}): {
  storage: StorageUploader;
  calls: UploadCall[];
} {
  const calls: UploadCall[] = [];
  const storage: StorageUploader = {
    async upload(path, body, { contentType }) {
      const size =
        body instanceof ArrayBuffer
          ? body.byteLength
          : (body as Uint8Array).byteLength;
      calls.push({ path, contentType, size });
      if (opts.fail) return { error: { message: "quota exceeded" } };
      return { error: null };
    },
  };
  return { storage, calls };
}

function bytes(n: number): ArrayBuffer {
  return new Uint8Array(n).buffer;
}

const FIXED_NOW = new Date("2026-09-13T10:30:45.123Z");

describe("POST /api/candour/[id]/attachment — handleAttachment()", () => {
  it("401 unauthenticated", async () => {
    const state = makeFakeCaseDb();
    const { storage } = makeStorage();
    const res = await handleAttachment(
      EVENT_ID,
      {
        filename: "note.pdf",
        contentType: "application/pdf",
        size: 1000,
        bytes: bytes(1000),
      },
      {
        getActor: async () => null,
        db: state.db,
        storage,
      },
    );
    assert.equal(res.status, 401);
  });

  it("403 non-admin", async () => {
    const state = makeFakeCaseDb();
    const { storage } = makeStorage();
    const res = await handleAttachment(
      EVENT_ID,
      {
        filename: "note.pdf",
        contentType: "application/pdf",
        size: 1000,
        bytes: bytes(1000),
      },
      {
        getActor: async () => ({ id: "u_1", role: "seeker" }),
        db: state.db,
        storage,
      },
    );
    assert.equal(res.status, 403);
  });

  it("400 missing file", async () => {
    const state = makeFakeCaseDb();
    const { storage } = makeStorage();
    const res = await handleAttachment(EVENT_ID, null, {
      getActor: async () => ({ id: "u_1", role: "admin" }),
      db: state.db,
      storage,
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "missing_file");
  });

  it("400 file too large (> 10 MB)", async () => {
    const state = makeFakeCaseDb();
    const { storage } = makeStorage();
    const size = 11 * 1024 * 1024;
    const res = await handleAttachment(
      EVENT_ID,
      {
        filename: "big.pdf",
        contentType: "application/pdf",
        size,
        bytes: bytes(1), // don't actually allocate 11MB
      },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
        storage,
      },
    );
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "file_too_large",
    );
  });

  it("400 unsupported mime", async () => {
    const state = makeFakeCaseDb();
    const { storage } = makeStorage();
    const res = await handleAttachment(
      EVENT_ID,
      {
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        size: 100,
        bytes: bytes(100),
      },
      {
        getActor: async () => ({ id: "u_1", role: "admin" }),
        db: state.db,
        storage,
      },
    );
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "unsupported_mime",
    );
  });

  it("happy path: uploads to bucket, writes attachment_added action, returns 201 with path", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "notified_regulator" });
    const { storage, calls } = makeStorage();
    const res = await handleAttachment(
      EVENT_ID,
      {
        filename: "cqc/../../reference letter.pdf",
        contentType: "application/pdf",
        size: 200,
        bytes: bytes(200),
      },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
        storage,
        now: () => FIXED_NOW,
      },
    );
    assert.equal(res.status, 201);
    const j = (await res.json()) as { ok: boolean; path: string };
    assert.equal(j.ok, true);
    // path shape: {event_id}/{sanitized_iso}_{sanitized_filename}
    assert.match(j.path, /^evt_1\/2026-09-13T10-30-45-123Z_.+\.pdf$/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].contentType, "application/pdf");
    const act = state.actions.find((a) => a.action === "attachment_added");
    assert.ok(act);
    assert.equal(act?.attachment_path, j.path);
  });

  it("400 when storage upload fails", async () => {
    const state = makeFakeCaseDb();
    seedEvent(state, { id: EVENT_ID, state: "open" });
    const { storage } = makeStorage({ fail: true });
    const res = await handleAttachment(
      EVENT_ID,
      {
        filename: "note.pdf",
        contentType: "application/pdf",
        size: 500,
        bytes: bytes(500),
      },
      {
        getActor: async () => ({ id: "u_admin", role: "admin" }),
        db: state.db,
        storage,
      },
    );
    assert.equal(res.status, 400);
    assert.equal(
      ((await res.json()) as { error: string }).error,
      "upload_failed",
    );
  });
});

describe("sanitizeFilename", () => {
  it("strips path traversal and spaces", () => {
    assert.equal(sanitizeFilename("../../evil.txt"), "evil.txt");
    assert.equal(sanitizeFilename("my note.pdf"), "my_note.pdf");
  });
  it("empty result becomes 'file'", () => {
    assert.equal(sanitizeFilename("   "), "file");
    assert.equal(sanitizeFilename(""), "file");
  });
  it("truncates to 100 chars", () => {
    const long = "a".repeat(200) + ".pdf";
    const result = sanitizeFilename(long);
    assert.equal(result.length, 100);
  });
});

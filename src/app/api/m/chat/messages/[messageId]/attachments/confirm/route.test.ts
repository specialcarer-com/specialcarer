/**
 * Route-level tests for POST /api/m/chat/messages/[messageId]/attachments/confirm.
 *
 * Auth + participation are guarded at the route boundary. Drives the pure
 * handler with a stub client covering: happy-path insert + signed read URL,
 * missing file = 404, non-sender = 403.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleConfirm,
  type AttachmentRow,
  type ConfirmClient,
} from "@/lib/chat/attachments-handler";

const THREAD_ID = "11111111-1111-1111-1111-111111111111";
const MESSAGE_ID = "22222222-2222-2222-2222-222222222222";
const SENDER_ID = "33333333-3333-3333-3333-333333333333";
const OTHER = "44444444-4444-4444-4444-444444444444";
const STORAGE_PATH = `${THREAD_ID}/${MESSAGE_ID}/abc.jpg`;

const ROW: AttachmentRow = {
  id: "att-1",
  message_id: MESSAGE_ID,
  storage_path: STORAGE_PATH,
  mime_type: "image/jpeg",
  size_bytes: 5000,
  width: 200,
  height: 200,
  filename: "cat.jpg",
  created_at: "2026-05-29T12:00:00.000Z",
};

function makeClient(opts: {
  meta?: { thread_id: string; sender_id: string } | null;
  exists?: boolean;
  insert?: { data: AttachmentRow | null; error: { message: string } | null };
  signed?: {
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  };
  inserted?: AttachmentRow[];
} = {}): ConfirmClient {
  return {
    async getMessageMeta() {
      return opts.meta === undefined
        ? { thread_id: THREAD_ID, sender_id: SENDER_ID }
        : opts.meta;
    },
    async fileExists() {
      return opts.exists ?? true;
    },
    async insertAttachment(row) {
      opts.inserted?.push({ ...ROW, ...row, id: "att-new" });
      return opts.insert ?? { data: { ...ROW, ...row, id: "att-new" }, error: null };
    },
    async createSignedReadUrl() {
      return (
        opts.signed ?? {
          data: { signedUrl: "https://signed.example/read" },
          error: null,
        }
      );
    },
  };
}

describe("POST /api/m/chat/messages/[messageId]/attachments/confirm", () => {
  it("happy path inserts row and returns signed read URL", async () => {
    const inserted: AttachmentRow[] = [];
    const res = await handleConfirm({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        storage_path: STORAGE_PATH,
        filename: "cat.jpg",
        mime_type: "image/jpeg",
        size_bytes: 5000,
        width: 200,
        height: 200,
      },
      client: makeClient({ inserted }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      attachment: AttachmentRow;
      signed_url: string;
    };
    assert.equal(json.signed_url, "https://signed.example/read");
    assert.equal(json.attachment.filename, "cat.jpg");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].width, 200);
  });

  it("missing storage file returns 404", async () => {
    const res = await handleConfirm({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        storage_path: STORAGE_PATH,
        filename: "cat.jpg",
        mime_type: "image/jpeg",
        size_bytes: 5000,
      },
      client: makeClient({ exists: false }),
    });
    assert.equal(res.status, 404);
  });

  it("non-sender returns 403", async () => {
    const res = await handleConfirm({
      message_id: MESSAGE_ID,
      user_id: OTHER,
      body: {
        storage_path: STORAGE_PATH,
        filename: "cat.jpg",
        mime_type: "image/jpeg",
        size_bytes: 5000,
      },
      client: makeClient(),
    });
    assert.equal(res.status, 403);
  });

  it("rejects storage_path outside the thread/message scope", async () => {
    const res = await handleConfirm({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        storage_path: "some-other-thread/somewhere/x.jpg",
        filename: "cat.jpg",
        mime_type: "image/jpeg",
        size_bytes: 5000,
      },
      client: makeClient(),
    });
    assert.equal(res.status, 400);
  });

  it("rejects wrong mime with 415", async () => {
    const res = await handleConfirm({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        storage_path: STORAGE_PATH,
        filename: "cat.gif",
        mime_type: "image/gif",
        size_bytes: 5000,
      },
      client: makeClient(),
    });
    assert.equal(res.status, 415);
  });

  it("propagates insert error as 500", async () => {
    const res = await handleConfirm({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        storage_path: STORAGE_PATH,
        filename: "cat.jpg",
        mime_type: "image/jpeg",
        size_bytes: 5000,
      },
      client: makeClient({
        insert: { data: null, error: { message: "db down" } },
      }),
    });
    assert.equal(res.status, 500);
  });
});

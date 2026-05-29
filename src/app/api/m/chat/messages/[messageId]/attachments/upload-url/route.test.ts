/**
 * Route-level tests for POST /api/m/chat/messages/[messageId]/attachments/upload-url.
 *
 * Auth + participation are guarded at the route boundary; this drives the
 * pure handler with a stub client. Covers the four reject paths in the brief
 * (non-sender 403, oversize 413, wrong mime 415, count limit 429) plus a
 * happy path that returns a signed URL.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleUploadUrl,
  type UploadUrlClient,
} from "@/lib/chat/attachments-handler";

const THREAD_ID = "11111111-1111-1111-1111-111111111111";
const MESSAGE_ID = "22222222-2222-2222-2222-222222222222";
const SENDER_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_USER = "44444444-4444-4444-4444-444444444444";

type Overrides = Partial<UploadUrlClient> & {
  meta?: { thread_id: string; sender_id: string } | null;
  count?: number;
  signed?: {
    data: { signedUrl: string; token?: string } | null;
    error: { message: string } | null;
  };
};

function makeClient(o: Overrides = {}): UploadUrlClient {
  return {
    async getMessageMeta() {
      return o.meta === undefined
        ? { thread_id: THREAD_ID, sender_id: SENDER_ID }
        : o.meta;
    },
    async countAttachments() {
      return o.count ?? 0;
    },
    async createSignedUploadUrl() {
      return (
        o.signed ?? {
          data: { signedUrl: "https://signed.example/upload", token: "tok" },
          error: null,
        }
      );
    },
    randomUUID() {
      return "deadbeef-dead-beef-dead-beefdeadbeef";
    },
    now() {
      return new Date("2026-05-29T12:00:00.000Z");
    },
    ...o,
  };
}

describe("POST /api/m/chat/messages/[messageId]/attachments/upload-url", () => {
  it("happy path returns signed URL + storage_path", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: { filename: "cat.jpg", mime_type: "image/jpeg", size_bytes: 12345 },
      client: makeClient(),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      upload_url: string;
      storage_path: string;
      expires_at: string;
    };
    assert.equal(json.upload_url, "https://signed.example/upload");
    assert.equal(
      json.storage_path,
      `${THREAD_ID}/${MESSAGE_ID}/deadbeef-dead-beef-dead-beefdeadbeef.jpg`,
    );
    // 10-minute TTL from injected now()
    assert.equal(json.expires_at, "2026-05-29T12:10:00.000Z");
  });

  it("non-sender gets 403", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: OTHER_USER,
      body: { filename: "x.png", mime_type: "image/png", size_bytes: 100 },
      client: makeClient(),
    });
    assert.equal(res.status, 403);
  });

  it("missing message returns 404", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: { filename: "x.png", mime_type: "image/png", size_bytes: 100 },
      client: makeClient({ meta: null }),
    });
    assert.equal(res.status, 404);
  });

  it("oversize file returns 413", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        filename: "big.pdf",
        mime_type: "application/pdf",
        size_bytes: 10 * 1024 * 1024 + 1,
      },
      client: makeClient(),
    });
    assert.equal(res.status, 413);
  });

  it("wrong mime returns 415", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: {
        filename: "bad.gif",
        mime_type: "image/gif",
        size_bytes: 100,
      },
      client: makeClient(),
    });
    assert.equal(res.status, 415);
  });

  it("count limit returns 429", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: { filename: "ok.jpg", mime_type: "image/jpeg", size_bytes: 100 },
      client: makeClient({ count: 5 }),
    });
    assert.equal(res.status, 429);
  });

  it("rejects non-object body", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: "not an object",
      client: makeClient(),
    });
    assert.equal(res.status, 400);
  });

  it("propagates a signed-url failure as 500", async () => {
    const res = await handleUploadUrl({
      message_id: MESSAGE_ID,
      user_id: SENDER_ID,
      body: { filename: "x.jpg", mime_type: "image/jpeg", size_bytes: 100 },
      client: makeClient({
        signed: { data: null, error: { message: "storage_down" } },
      }),
    });
    assert.equal(res.status, 500);
  });
});

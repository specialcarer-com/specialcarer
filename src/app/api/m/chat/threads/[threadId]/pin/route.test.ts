/**
 * Route-level tests for PATCH /api/m/chat/threads/[id]/pin.
 *
 * Drives the pure handler with a stub PinClient — auth & participation
 * are guarded at the route boundary, so the handler test focuses on
 * body validation + update wiring. Matches the node:test pattern used
 * by sibling route tests (see route.test.ts under booking-tasks).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handlePinThread,
  type PinClient,
  type PinnedThreadRow,
} from "@/lib/chat/pin-handler";

const ROW: PinnedThreadRow = {
  id: "thread-1",
  booking_id: "booking-1",
  pinned: true,
  archived_at: null,
  archived_reason: null,
  archived_by: null,
  created_at: "2026-05-27T10:00:00.000Z",
};

function makeClient(opts: {
  result?: { data: PinnedThreadRow | null; error: { message: string } | null };
  captured?: { id: string; pinned: boolean }[];
}): PinClient {
  return {
    async updatePinned(id, pinned) {
      opts.captured?.push({ id, pinned });
      return opts.result ?? { data: { ...ROW, pinned }, error: null };
    },
  };
}

describe("PATCH /api/m/chat/threads/[id]/pin (handlePinThread)", () => {
  it("happy path: returns updated thread row with pinned=true", async () => {
    const captured: { id: string; pinned: boolean }[] = [];
    const res = await handlePinThread({
      thread_id: "thread-1",
      body: { pinned: true },
      client: makeClient({ captured }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { thread: PinnedThreadRow };
    assert.equal(json.thread.id, "thread-1");
    assert.equal(json.thread.pinned, true);
    assert.deepEqual(captured, [{ id: "thread-1", pinned: true }]);
  });

  it("happy path: unpin (pinned=false) round-trips", async () => {
    const captured: { id: string; pinned: boolean }[] = [];
    const res = await handlePinThread({
      thread_id: "thread-1",
      body: { pinned: false },
      client: makeClient({
        result: { data: { ...ROW, pinned: false }, error: null },
        captured,
      }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { thread: PinnedThreadRow };
    assert.equal(json.thread.pinned, false);
    assert.deepEqual(captured, [{ id: "thread-1", pinned: false }]);
  });

  it("rejects a non-object body with 400", async () => {
    const res = await handlePinThread({
      thread_id: "thread-1",
      body: "not-an-object",
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a body where `pinned` is not boolean", async () => {
    const res = await handlePinThread({
      thread_id: "thread-1",
      body: { pinned: "true" },
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("propagates a 500 when the DB update errors", async () => {
    const res = await handlePinThread({
      thread_id: "thread-1",
      body: { pinned: true },
      client: makeClient({
        result: { data: null, error: { message: "boom" } },
      }),
    });
    assert.equal(res.status, 500);
  });
});

/**
 * Route-level tests for POST /api/admin/chat/threads/[id]/unarchive.
 *
 * Mirrors src/app/api/admin/training/courses/route.test.ts — we drive
 * the pure handler with a stub client so auth (handled at the route
 * boundary via requireAdminApi) isn't part of the unit under test.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleUnarchiveThread,
  type UnarchiveClient,
} from "@/lib/chat/unarchive-handler";
import type { PinnedThreadRow } from "@/lib/chat/pin-handler";

const CLEARED: PinnedThreadRow = {
  id: "thread-1",
  booking_id: "booking-1",
  pinned: false,
  archived_at: null,
  archived_reason: null,
  archived_by: null,
  created_at: "2026-05-27T10:00:00.000Z",
};

describe("POST /api/admin/chat/threads/[id]/unarchive (handleUnarchiveThread)", () => {
  it("happy path: returns the cleared thread row", async () => {
    const captured: string[] = [];
    const client: UnarchiveClient = {
      async unarchiveThread(id) {
        captured.push(id);
        return { data: CLEARED, error: null };
      },
    };
    const res = await handleUnarchiveThread({
      thread_id: "thread-1",
      client,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { thread: PinnedThreadRow };
    assert.equal(json.thread.archived_at, null);
    assert.equal(json.thread.archived_reason, null);
    assert.equal(json.thread.archived_by, null);
    assert.deepEqual(captured, ["thread-1"]);
  });

  it("404 when the thread does not exist", async () => {
    const client: UnarchiveClient = {
      async unarchiveThread() {
        return { data: null, error: null };
      },
    };
    const res = await handleUnarchiveThread({
      thread_id: "missing",
      client,
    });
    assert.equal(res.status, 404);
  });

  it("500 when the DB update errors", async () => {
    const client: UnarchiveClient = {
      async unarchiveThread() {
        return { data: null, error: { message: "boom" } };
      },
    };
    const res = await handleUnarchiveThread({
      thread_id: "thread-1",
      client,
    });
    assert.equal(res.status, 500);
  });
});

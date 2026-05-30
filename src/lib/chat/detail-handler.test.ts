/**
 * Tests for the chat thread detail handler.
 *
 * node:test, stub DetailClient. Covers the 403 (non-participant) gate,
 * the happy-path assembly (role + counterpart + booking summary), and
 * the 404 when the thread row is missing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleThreadDetail,
  type DetailClient,
  type ThreadDetail,
} from "./detail-handler";

function makeClient(over: Partial<DetailClient> = {}): DetailClient {
  return {
    async myRole() {
      return { role: "seeker", error: null };
    },
    async thread() {
      return {
        data: {
          id: "t1",
          booking_id: "b1",
          pinned: true,
          archived_at: null,
          archived_reason: null,
        },
        error: null,
      };
    },
    async counterpart() {
      return {
        data: { display_name: "Carer One", avatar_url: "http://x/a.png" },
        error: null,
      };
    },
    async booking() {
      return {
        data: {
          service_type: "elderly",
          starts_at: "2026-04-01T10:00:00Z",
          status: "accepted",
        },
        error: null,
      };
    },
    ...over,
  };
}

describe("handleThreadDetail", () => {
  it("403 when the caller is not an active participant", async () => {
    const res = await handleThreadDetail({
      thread_id: "t1",
      user_id: "stranger",
      client: makeClient({
        async myRole() {
          return { role: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 403);
  });

  it("assembles role + counterpart + booking summary", async () => {
    const res = await handleThreadDetail({
      thread_id: "t1",
      user_id: "me",
      client: makeClient(),
    });
    assert.equal(res.status, 200);
    const { thread } = (await res.json()) as { thread: ThreadDetail };
    assert.equal(thread.viewer_role, "seeker");
    assert.equal(thread.pinned, true);
    assert.equal(thread.counterpart_name, "Carer One");
    assert.equal(thread.counterpart_avatar_url, "http://x/a.png");
    assert.equal(thread.booking?.service_type, "elderly");
    assert.equal(thread.booking?.status, "accepted");
  });

  it("404 when the thread row is missing", async () => {
    const res = await handleThreadDetail({
      thread_id: "t1",
      user_id: "me",
      client: makeClient({
        async thread() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("propagates a 500 when the role lookup errors", async () => {
    const res = await handleThreadDetail({
      thread_id: "t1",
      user_id: "me",
      client: makeClient({
        async myRole() {
          return { role: null, error: { message: "boom" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });

  it("tolerates a missing counterpart and booking (nulls)", async () => {
    const res = await handleThreadDetail({
      thread_id: "t1",
      user_id: "me",
      client: makeClient({
        async counterpart() {
          return { data: null, error: null };
        },
        async booking() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    const { thread } = (await res.json()) as { thread: ThreadDetail };
    assert.equal(thread.counterpart_name, null);
    assert.equal(thread.booking, null);
  });
});

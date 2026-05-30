/**
 * Tests for the chat thread list handler.
 *
 * node:test like the rest of src/lib/chat/*. Drives handleListThreads
 * with a stub ListClient so the assembly + sort + unread logic can be
 * checked without a live DB, and exercises compareThreads directly for
 * the ORDER BY contract (live > pinned > recency).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareThreads,
  handleListThreads,
  type ListClient,
  type ThreadListItem,
} from "./list-handler";

function item(over: Partial<ThreadListItem>): ThreadListItem {
  return {
    id: "t",
    booking_id: "b",
    pinned: false,
    archived_at: null,
    archived_reason: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
    participant_count: 2,
    viewer_role: "seeker",
    counterpart_name: null,
    counterpart_avatar_url: null,
    ...over,
  };
}

describe("compareThreads (ORDER BY contract)", () => {
  it("sorts live threads above archived", () => {
    const live = item({ id: "live", archived_at: null });
    const arch = item({ id: "arch", archived_at: "2026-01-01T00:00:00Z" });
    const out = [arch, live].sort(compareThreads).map((t) => t.id);
    assert.deepEqual(out, ["live", "arch"]);
  });

  it("sorts pinned above unpinned within the same archive group", () => {
    const pinned = item({ id: "p", pinned: true });
    const plain = item({ id: "u", pinned: false });
    const out = [plain, pinned].sort(compareThreads).map((t) => t.id);
    assert.deepEqual(out, ["p", "u"]);
  });

  it("sorts by most recent activity within a pin group", () => {
    const older = item({ id: "old", last_message_at: "2026-01-01T00:00:00Z" });
    const newer = item({ id: "new", last_message_at: "2026-02-01T00:00:00Z" });
    const out = [older, newer].sort(compareThreads).map((t) => t.id);
    assert.deepEqual(out, ["new", "old"]);
  });

  it("ranks live-unpinned above archived-pinned (archive dominates pin)", () => {
    const liveUnpinned = item({ id: "live", pinned: false, archived_at: null });
    const archPinned = item({
      id: "arch",
      pinned: true,
      archived_at: "2026-01-01T00:00:00Z",
    });
    const out = [archPinned, liveUnpinned].sort(compareThreads).map((t) => t.id);
    assert.deepEqual(out, ["live", "arch"]);
  });
});

function makeClient(over: Partial<ListClient> = {}): ListClient {
  return {
    async myParticipantRows() {
      return {
        data: [
          { thread_id: "t1", role: "seeker", last_read_at: null },
          { thread_id: "t2", role: "seeker", last_read_at: null },
        ],
        error: null,
      };
    },
    async threadsByIds() {
      return {
        data: [
          {
            id: "t1",
            booking_id: "b1",
            pinned: false,
            archived_at: null,
            archived_reason: null,
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "t2",
            booking_id: "b2",
            pinned: true,
            archived_at: null,
            archived_reason: null,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      };
    },
    async visibleMessages() {
      return {
        data: [
          {
            thread_id: "t1",
            sender_id: "other",
            body: "hello from t1",
            created_at: "2026-03-01T00:00:00Z",
          },
          {
            thread_id: "t2",
            sender_id: "me",
            body: "my own message",
            created_at: "2026-02-01T00:00:00Z",
          },
        ],
        error: null,
      };
    },
    async participantsForThreads() {
      return {
        data: [
          {
            thread_id: "t1",
            user_id: "other",
            role: "carer",
            display_name: "Carer One",
            avatar_url: null,
          },
          {
            thread_id: "t1",
            user_id: "me",
            role: "seeker",
            display_name: "Me",
            avatar_url: null,
          },
          {
            thread_id: "t2",
            user_id: "other2",
            role: "carer",
            display_name: "Carer Two",
            avatar_url: null,
          },
          {
            thread_id: "t2",
            user_id: "me",
            role: "seeker",
            display_name: "Me",
            avatar_url: null,
          },
        ],
        error: null,
      };
    },
    ...over,
  };
}

describe("handleListThreads", () => {
  it("401-less empty when the user has no threads", async () => {
    const res = await handleListThreads({
      user_id: "me",
      client: makeClient({
        async myParticipantRows() {
          return { data: [], error: null };
        },
      }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { threads: ThreadListItem[] };
    assert.deepEqual(json.threads, []);
  });

  it("assembles preview, unread count, counterpart, and pinned-first sort", async () => {
    const res = await handleListThreads({ user_id: "me", client: makeClient() });
    assert.equal(res.status, 200);
    const { threads } = (await res.json()) as { threads: ThreadListItem[] };
    // t2 is pinned → first despite older message.
    assert.deepEqual(
      threads.map((t) => t.id),
      ["t2", "t1"],
    );
    const t1 = threads.find((t) => t.id === "t1")!;
    assert.equal(t1.last_message_preview, "hello from t1");
    assert.equal(t1.unread_count, 1); // incoming, unread
    assert.equal(t1.counterpart_name, "Carer One");
    const t2 = threads.find((t) => t.id === "t2")!;
    assert.equal(t2.unread_count, 0); // own message never counts as unread
    assert.equal(t2.counterpart_name, "Carer Two");
  });

  it("does not count a viewer's own message as unread, and respects last_read_at", async () => {
    const res = await handleListThreads({
      user_id: "me",
      client: makeClient({
        async myParticipantRows() {
          return {
            data: [
              { thread_id: "t1", role: "seeker", last_read_at: "2026-03-02T00:00:00Z" },
            ],
            error: null,
          };
        },
        async threadsByIds() {
          return {
            data: [
              {
                id: "t1",
                booking_id: "b1",
                pinned: false,
                archived_at: null,
                archived_reason: null,
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            error: null,
          };
        },
        async visibleMessages() {
          return {
            data: [
              {
                thread_id: "t1",
                sender_id: "other",
                body: "read already",
                created_at: "2026-03-01T00:00:00Z",
              },
            ],
            error: null,
          };
        },
        async participantsForThreads() {
          return { data: [], error: null };
        },
      }),
    });
    const { threads } = (await res.json()) as { threads: ThreadListItem[] };
    assert.equal(threads[0].unread_count, 0); // message older than last_read_at
  });

  it("propagates a 500 when the participant lookup errors", async () => {
    const res = await handleListThreads({
      user_id: "me",
      client: makeClient({
        async myParticipantRows() {
          return { data: null, error: { message: "boom" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

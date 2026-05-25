/**
 * Pure-logic tests for the chat backbone — no Supabase round-trips.
 *
 * Covers the two branches that have non-trivial behavior independent
 * of the DB:
 *   - sendMessage body validation (length 1-4000, non-string rejected)
 *   - getOrCreateBookingThread throwing chat_no_carer_yet when the
 *     booking has no caregiver_id yet
 * RLS enforcement and happy-path inserts are exercised by the
 * migration in CI, not here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateBody,
  getOrCreateBookingThreadWith,
  archiveBookingThreadWith,
  isThreadParticipantWith,
  getUnreadThreadIdsWith,
  MAX_BODY,
  type AdminLike,
} from "./server";

describe("validateBody (sendMessage length check)", () => {
  it("accepts a normal message and returns the trimmed body", () => {
    assert.equal(validateBody("hi"), "hi");
    assert.equal(validateBody("  hello  "), "hello");
  });

  it("accepts a message exactly at MAX_BODY", () => {
    const s = "x".repeat(MAX_BODY);
    assert.equal(validateBody(s).length, MAX_BODY);
  });

  it("rejects an empty / whitespace-only body", () => {
    assert.throws(() => validateBody(""), /chat_body_invalid/);
    assert.throws(() => validateBody("   "), /chat_body_invalid/);
  });

  it("rejects a body over MAX_BODY", () => {
    const tooLong = "x".repeat(MAX_BODY + 1);
    assert.throws(() => validateBody(tooLong), /chat_body_invalid/);
  });

  it("rejects non-string input", () => {
    assert.throws(() => validateBody(undefined), /chat_body_invalid/);
    assert.throws(() => validateBody(123 as unknown), /chat_body_invalid/);
    assert.throws(() => validateBody(null), /chat_body_invalid/);
  });
});

/**
 * Tiny supabase-client stub that returns scripted results per table.
 * Each table maps to the chain of methods the server module calls on
 * it — only enough surface to drive the unit under test.
 */
type Result = { data: unknown; error: { message: string } | null };

function makeAdmin(handlers: {
  chat_threads_select?: Result;
  bookings_select?: Result;
  chat_threads_insert?: Result;
  chat_participants_insert?: Result;
}) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];
  function from(table: string) {
    if (table === "chat_threads") {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  calls.push({ table, op: "select" });
                  return (
                    handlers.chat_threads_select ?? {
                      data: null,
                      error: null,
                    }
                  );
                },
              };
            },
          };
        },
        insert(payload: unknown) {
          calls.push({ table, op: "insert", payload });
          return {
            select() {
              return {
                async single() {
                  return (
                    handlers.chat_threads_insert ?? {
                      data: null,
                      error: { message: "no insert handler" },
                    }
                  );
                },
              };
            },
          };
        },
      };
    }
    if (table === "bookings") {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  calls.push({ table, op: "select" });
                  return (
                    handlers.bookings_select ?? {
                      data: null,
                      error: { message: "no booking handler" },
                    }
                  );
                },
              };
            },
          };
        },
      };
    }
    if (table === "chat_participants") {
      return {
        async insert(payload: unknown) {
          calls.push({ table, op: "insert", payload });
          return (
            handlers.chat_participants_insert ?? { data: null, error: null }
          );
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  }
  return { from, calls } as const;
}

describe("getOrCreateBookingThread — chat_no_carer_yet branch", () => {
  it("throws when the booking has no caregiver_id", async () => {
    const admin = makeAdmin({
      chat_threads_select: { data: null, error: null },
      bookings_select: {
        data: { seeker_id: "seeker-1", caregiver_id: null },
        error: null,
      },
    });
    await assert.rejects(
      () => getOrCreateBookingThreadWith(admin as unknown as AdminLike, "booking-1"),
      /chat_no_carer_yet/,
    );
    // No thread / participant inserts should have been attempted.
    const inserts = admin.calls.filter((c) => c.op === "insert");
    assert.equal(inserts.length, 0);
  });

  it("returns the existing thread without re-creating it", async () => {
    const existing = {
      id: "thread-1",
      booking_id: "booking-1",
      archived_at: null,
      created_at: "2026-05-24T00:00:00.000Z",
    };
    const admin = makeAdmin({
      chat_threads_select: { data: existing, error: null },
    });
    const got = await getOrCreateBookingThreadWith(
      admin as unknown as AdminLike,
      "booking-1",
    );
    assert.deepEqual(got, existing);
    // Should not have hit bookings or any insert path.
    assert.equal(
      admin.calls.some((c) => c.table === "bookings"),
      false,
    );
    assert.equal(
      admin.calls.some((c) => c.op === "insert"),
      false,
    );
  });

  it("creates thread + seeds two participants when missing", async () => {
    const created = {
      id: "thread-new",
      booking_id: "booking-2",
      archived_at: null,
      created_at: "2026-05-24T00:00:01.000Z",
    };
    const admin = makeAdmin({
      chat_threads_select: { data: null, error: null },
      bookings_select: {
        data: { seeker_id: "seeker-2", caregiver_id: "carer-2" },
        error: null,
      },
      chat_threads_insert: { data: created, error: null },
      chat_participants_insert: { data: null, error: null },
    });
    const got = await getOrCreateBookingThreadWith(
      admin as unknown as AdminLike,
      "booking-2",
    );
    assert.deepEqual(got, created);
    const partInsert = admin.calls.find(
      (c) => c.table === "chat_participants" && c.op === "insert",
    );
    assert.ok(partInsert, "participants insert should fire");
    const payload = partInsert!.payload as Array<{
      thread_id: string;
      user_id: string;
    }>;
    assert.equal(payload.length, 2);
    assert.deepEqual(
      payload.map((p) => p.user_id).sort(),
      ["carer-2", "seeker-2"],
    );
    for (const row of payload) {
      assert.equal(row.thread_id, "thread-new");
    }
  });
});

describe("archiveBookingThread", () => {
  it("issues an UPDATE chat_threads ... where booking_id = ? and archived_at is null", async () => {
    const calls: {
      table: string;
      op: string;
      payload?: unknown;
      col?: string;
      val?: unknown;
    }[] = [];
    let archivedRow: { archived_at: string } | null = null;

    const admin: AdminLike = {
      from(table: string) {
        if (table === "chat_threads") {
          return {
            select() {
              throw new Error("not used");
            },
            insert() {
              throw new Error("not used");
            },
            update(payload: unknown) {
              calls.push({ table, op: "update", payload });
              archivedRow = payload as { archived_at: string };
              const chain = {
                eq(col: string, val: string) {
                  calls.push({ table, op: "eq", col, val });
                  return chain;
                },
                is(col: string, val: unknown) {
                  calls.push({ table, op: "is", col, val });
                  return Object.assign(
                    Promise.resolve({ data: null, error: null }),
                    chain,
                  );
                },
                then(resolve: (r: { data: unknown; error: null }) => void) {
                  resolve({ data: null, error: null });
                },
              };
              return Object.assign(
                Promise.resolve({ data: null, error: null }),
                chain,
              );
            },
          } as unknown as ReturnType<AdminLike["from"]>;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    await archiveBookingThreadWith(admin, "booking-99");

    const updateCall = calls.find((c) => c.op === "update");
    assert.ok(updateCall, "update should be called");
    assert.equal(
      typeof (updateCall!.payload as { archived_at?: unknown }).archived_at,
      "string",
    );
    const eqCall = calls.find((c) => c.op === "eq");
    assert.ok(eqCall, "eq should be called");
    assert.equal(eqCall!.col, "booking_id");
    assert.equal(eqCall!.val, "booking-99");
    const isCall = calls.find((c) => c.op === "is");
    assert.ok(isCall, "is should be called");
    assert.equal(isCall!.col, "archived_at");
    assert.equal(isCall!.val, null);
    assert.ok(archivedRow, "archived row payload should be captured");
  });

  it("swallows errors from the update", async () => {
    const admin: AdminLike = {
      from() {
        throw new Error("boom");
      },
    };
    // Should not throw.
    await archiveBookingThreadWith(admin, "booking-x");
  });
});

describe("isThreadParticipant", () => {
  function makeMembershipAdmin(opts: {
    found: boolean;
    error?: { message: string };
  }): AdminLike {
    return {
      from(table: string) {
        if (table !== "chat_participants") throw new Error("wrong table");
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      async maybeSingle() {
                        return {
                          data: opts.found ? { user_id: "u" } : null,
                          error: opts.error ?? null,
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          insert() {
            throw new Error("not used");
          },
        } as unknown as ReturnType<AdminLike["from"]>;
      },
    };
  }

  it("returns true when the membership row exists", async () => {
    const admin = makeMembershipAdmin({ found: true });
    assert.equal(await isThreadParticipantWith(admin, "t1", "u1"), true);
  });

  it("returns false when no row exists", async () => {
    const admin = makeMembershipAdmin({ found: false });
    assert.equal(await isThreadParticipantWith(admin, "t1", "u1"), false);
  });

  it("returns false on error rather than throwing", async () => {
    const admin = makeMembershipAdmin({
      found: false,
      error: { message: "boom" },
    });
    assert.equal(await isThreadParticipantWith(admin, "t1", "u1"), false);
  });
});

/**
 * Tiny stub matching the structural shape getUnreadThreadIdsWith uses
 * (.from(table).select(cols).in(col, vals)). Each table maps to a
 * scripted `Result` — enough surface to drive the unit without a real
 * Postgrest client.
 */
type UnreadHandlers = {
  chat_threads?: Result;
  chat_messages?: Result;
  chat_participants?: Result;
};
function makeUnreadAdmin(h: UnreadHandlers) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            async in() {
              const key = table as keyof UnreadHandlers;
              return h[key] ?? { data: [], error: null };
            },
          };
        },
      };
    },
  };
}

describe("getUnreadThreadIds", () => {
  it("returns empty for empty input", async () => {
    const admin = makeUnreadAdmin({});
    const out = await getUnreadThreadIdsWith(admin, "user-a", []);
    assert.equal(out.size, 0);
  });

  it("marks a booking as unread when an incoming message is newer than last_read_at", async () => {
    const admin = makeUnreadAdmin({
      chat_threads: {
        data: [{ id: "th-1", booking_id: "bk-1" }],
        error: null,
      },
      chat_messages: {
        data: [
          {
            thread_id: "th-1",
            sender_id: "other",
            created_at: "2026-05-25T10:00:00.000Z",
          },
        ],
        error: null,
      },
      chat_participants: {
        data: [
          {
            thread_id: "th-1",
            user_id: "user-a",
            last_read_at: "2026-05-25T09:00:00.000Z",
          },
        ],
        error: null,
      },
    });
    const out = await getUnreadThreadIdsWith(admin, "user-a", ["bk-1"]);
    assert.deepEqual([...out], ["bk-1"]);
  });

  it("does not mark a booking as unread when the only newer message is from the caller themself", async () => {
    const admin = makeUnreadAdmin({
      chat_threads: {
        data: [{ id: "th-2", booking_id: "bk-2" }],
        error: null,
      },
      chat_messages: {
        data: [
          {
            thread_id: "th-2",
            sender_id: "user-a", // <- self
            created_at: "2026-05-25T11:00:00.000Z",
          },
        ],
        error: null,
      },
      chat_participants: {
        data: [
          {
            thread_id: "th-2",
            user_id: "user-a",
            last_read_at: "2026-05-25T09:00:00.000Z",
          },
        ],
        error: null,
      },
    });
    const out = await getUnreadThreadIdsWith(admin, "user-a", ["bk-2"]);
    assert.equal(out.size, 0);
  });

  it("treats a never-read thread (last_read_at = null) as unread when there is any incoming", async () => {
    const admin = makeUnreadAdmin({
      chat_threads: {
        data: [{ id: "th-3", booking_id: "bk-3" }],
        error: null,
      },
      chat_messages: {
        data: [
          {
            thread_id: "th-3",
            sender_id: "other",
            created_at: "2026-05-25T08:00:00.000Z",
          },
        ],
        error: null,
      },
      chat_participants: {
        data: [
          { thread_id: "th-3", user_id: "user-a", last_read_at: null },
        ],
        error: null,
      },
    });
    const out = await getUnreadThreadIdsWith(admin, "user-a", ["bk-3"]);
    assert.deepEqual([...out], ["bk-3"]);
  });

  it("returns a mixed set across read + unread threads in one batch", async () => {
    const admin = makeUnreadAdmin({
      chat_threads: {
        data: [
          { id: "th-r", booking_id: "bk-read" },
          { id: "th-u", booking_id: "bk-unread" },
          { id: "th-q", booking_id: "bk-quiet" }, // no messages
        ],
        error: null,
      },
      chat_messages: {
        data: [
          // read thread — message is older than last_read
          {
            thread_id: "th-r",
            sender_id: "other",
            created_at: "2026-05-25T07:00:00.000Z",
          },
          // unread thread — newer than last_read
          {
            thread_id: "th-u",
            sender_id: "other",
            created_at: "2026-05-25T12:00:00.000Z",
          },
        ],
        error: null,
      },
      chat_participants: {
        data: [
          {
            thread_id: "th-r",
            user_id: "user-a",
            last_read_at: "2026-05-25T09:00:00.000Z",
          },
          {
            thread_id: "th-u",
            user_id: "user-a",
            last_read_at: "2026-05-25T10:00:00.000Z",
          },
          {
            thread_id: "th-q",
            user_id: "user-a",
            last_read_at: null,
          },
        ],
        error: null,
      },
    });
    const out = await getUnreadThreadIdsWith(admin, "user-a", [
      "bk-read",
      "bk-unread",
      "bk-quiet",
    ]);
    assert.deepEqual([...out].sort(), ["bk-unread"]);
  });

  it("returns empty when the threads query errors (defensive)", async () => {
    const admin = makeUnreadAdmin({
      chat_threads: { data: null, error: { message: "boom" } },
    });
    const out = await getUnreadThreadIdsWith(admin, "user-a", ["bk-x"]);
    assert.equal(out.size, 0);
  });
});

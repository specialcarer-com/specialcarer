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

/**
 * Unit tests for the chat server lib.
 *
 * Uses the __setChatHooks test seam to swap in an in-memory fake admin
 * client + dispatcher. No external services, no DB. Covers:
 *   - getOrCreateBookingThread idempotency
 *   - sendMessage bumps last_message_at
 *   - sendMessage dispatches once per OTHER participant (not sender)
 *   - archiveThread sets archived_at
 *   - archiveThreadsForBooking targets the right rows
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  __setChatHooks,
  __resetChatHooks,
  archiveThread,
  archiveThreadsForBooking,
  getOrCreateBookingThread,
  sendMessage,
} from "./server";
import type { PushEvent } from "@/lib/push/notify";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

let db: Tables = {
  bookings: [],
  chat_threads: [],
  chat_participants: [],
  chat_messages: [],
};
let dispatchCalls: PushEvent[] = [];

function uuid(): string {
  return `id-${Math.random().toString(36).slice(2, 10)}`;
}

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "neq"; col: string; val: unknown }
  | { kind: "in"; col: string; vals: unknown[] }
  | { kind: "is"; col: string; val: unknown }
  | { kind: "gt"; col: string; val: unknown }
  | { kind: "lt"; col: string; val: unknown };

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((row) => {
    for (const f of filters) {
      const v = row[f.col];
      if (f.kind === "eq" && v !== f.val) return false;
      if (f.kind === "neq" && v === f.val) return false;
      if (f.kind === "in" && !f.vals.includes(v)) return false;
      if (f.kind === "is") {
        if (f.val === null && v != null) return false;
        if (f.val !== null && v !== f.val) return false;
      }
      if (f.kind === "gt") {
        if (v == null || !(String(v) > String(f.val))) return false;
      }
      if (f.kind === "lt") {
        if (v == null || !(String(v) < String(f.val))) return false;
      }
    }
    return true;
  });
}

function makeQuery(table: string) {
  const filters: Filter[] = [];
  let orderBy: null | { col: string; asc: boolean } = null;
  let lim: number | null = null;

  function exec(): Row[] {
    let rows = applyFilters(db[table] ?? [], filters);
    if (orderBy) {
      const { col, asc } = orderBy;
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  }

  const q: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      filters.push({ kind: "eq", col, val });
      return q;
    },
    neq(col: string, val: unknown) {
      filters.push({ kind: "neq", col, val });
      return q;
    },
    in(col: string, vals: unknown[]) {
      filters.push({ kind: "in", col, vals });
      return q;
    },
    is(col: string, val: unknown) {
      filters.push({ kind: "is", col, val });
      return q;
    },
    gt(col: string, val: unknown) {
      filters.push({ kind: "gt", col, val });
      return q;
    },
    lt(col: string, val: unknown) {
      filters.push({ kind: "lt", col, val });
      return q;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderBy = { col, asc: opts?.ascending ?? true };
      return q;
    },
    limit(n: number) {
      lim = n;
      return q;
    },
    maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
    single: async () => {
      const rows = exec();
      if (rows.length === 0) return { data: null, error: { message: "no row" } };
      return { data: rows[0], error: null };
    },
    then(resolve: (r: { data: Row[]; error: null; count: number }) => unknown) {
      const rows = exec();
      resolve({ data: rows, error: null, count: rows.length });
    },
  };
  return q;
}

function createFakeAdmin(): unknown {
  return {
    from(table: string) {
      return {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          const q = makeQuery(table);
          if (opts?.head) {
            // count-only variant
            const headQ: Record<string, unknown> = {
              eq(col: string, val: unknown) {
                (q as { eq: (c: string, v: unknown) => unknown }).eq(col, val);
                return headQ;
              },
              neq(col: string, val: unknown) {
                (q as { neq: (c: string, v: unknown) => unknown }).neq(col, val);
                return headQ;
              },
              is(col: string, val: unknown) {
                (q as { is: (c: string, v: unknown) => unknown }).is(col, val);
                return headQ;
              },
              gt(col: string, val: unknown) {
                (q as { gt: (c: string, v: unknown) => unknown }).gt(col, val);
                return headQ;
              },
              lt(col: string, val: unknown) {
                (q as { lt: (c: string, v: unknown) => unknown }).lt(col, val);
                return headQ;
              },
              then(resolve: (r: { count: number; error: null }) => unknown) {
                const inner = q as {
                  then: (
                    r: (v: { data: Row[]; error: null; count: number }) => unknown,
                  ) => void;
                };
                inner.then((v) => resolve({ count: v.count, error: null }));
              },
            };
            return headQ;
          }
          return q;
        },
        insert(row: Row | Row[]) {
          const rows = Array.isArray(row) ? row : [row];
          const inserted = rows.map((r) => {
            const withDefaults: Row = {
              id: uuid(),
              created_at: new Date(Date.now() + Math.random()).toISOString(),
              archived_at: null,
              last_message_at: null,
              deleted_at: null,
              ...r,
            };
            db[table].push(withDefaults);
            return withDefaults;
          });
          return {
            select(_cols: string) {
              return {
                single: async () => ({ data: inserted[0], error: null }),
              };
            },
          };
        },
        upsert(rows: Row | Row[], _opts?: { onConflict?: string }) {
          const list = Array.isArray(rows) ? rows : [rows];
          for (const r of list) {
            db[table].push({
              joined_at: new Date().toISOString(),
              last_read_at: null,
              ...r,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: Row) {
          const filters: Filter[] = [];
          const builder: Record<string, unknown> = {
            eq(col: string, val: unknown) {
              filters.push({ kind: "eq", col, val });
              return builder;
            },
            is(col: string, val: unknown) {
              filters.push({ kind: "is", col, val });
              return builder;
            },
            then(resolve: (r: { error: null }) => unknown) {
              for (const row of db[table]) {
                if (applyFilters([row], filters).length === 1) {
                  Object.assign(row, patch);
                }
              }
              resolve({ error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

beforeEach(() => {
  db = {
    bookings: [],
    chat_threads: [],
    chat_participants: [],
    chat_messages: [],
  };
  dispatchCalls = [];
  __setChatHooks({
    createAdminClient: () => createFakeAdmin() as never,
    createServerClient: async () => createFakeAdmin() as never,
    dispatch: async (event: PushEvent) => {
      dispatchCalls.push(event);
      return { ok: true, delivered: 1, skipped: 0 };
    },
  });
});

describe("getOrCreateBookingThread", () => {
  it("creates a thread + seats seeker and carer; second call returns same id", async () => {
    db.bookings.push({
      id: "bk_1",
      seeker_id: "u_seeker",
      caregiver_id: "u_carer",
    });

    const a = await getOrCreateBookingThread("bk_1", "u_seeker");
    assert.ok(a);
    assert.equal(db.chat_threads.length, 1);
    assert.equal(db.chat_participants.length, 2);
    const roles = new Set(db.chat_participants.map((p) => p.role));
    assert.ok(roles.has("seeker"));
    assert.ok(roles.has("carer"));

    const b = await getOrCreateBookingThread("bk_1", "u_carer");
    assert.ok(b);
    assert.equal(b!.id, a!.id);
    assert.equal(db.chat_threads.length, 1);
  });

  it("returns null when the caller is not a party to the booking", async () => {
    db.bookings.push({
      id: "bk_2",
      seeker_id: "u_seeker",
      caregiver_id: "u_carer",
    });
    const result = await getOrCreateBookingThread("bk_2", "u_outsider");
    assert.equal(result, null);
    assert.equal(db.chat_threads.length, 0);
  });
});

describe("sendMessage", () => {
  function seedThread(): string {
    const tid = uuid();
    db.chat_threads.push({
      id: tid,
      booking_id: "bk_x",
      created_at: new Date().toISOString(),
      archived_at: null,
      last_message_at: null,
    });
    db.chat_participants.push(
      {
        thread_id: tid,
        user_id: "u_a",
        role: "seeker",
        joined_at: "",
        last_read_at: null,
      },
      {
        thread_id: tid,
        user_id: "u_b",
        role: "carer",
        joined_at: "",
        last_read_at: null,
      },
    );
    return tid;
  }

  it("bumps last_message_at after insert", async () => {
    const tid = seedThread();
    assert.equal(db.chat_threads[0].last_message_at, null);
    await sendMessage(tid, "u_a", { body: "hello" });
    assert.ok(db.chat_threads[0].last_message_at);
  });

  it("fires dispatch exactly once, for the OTHER participant", async () => {
    const tid = seedThread();
    await sendMessage(tid, "u_a", { body: "hello peer" });
    assert.equal(dispatchCalls.length, 1);
    const ev = dispatchCalls[0];
    assert.equal(ev.type, "message.received");
    if (ev.type === "message.received") {
      assert.equal(ev.user_id, "u_b");
      assert.equal(ev.thread_id, tid);
      assert.equal(ev.preview, "hello peer");
    }
  });

  it("does not dispatch to the sender", async () => {
    const tid = seedThread();
    await sendMessage(tid, "u_b", { body: "from carer" });
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0].user_id, "u_a");
  });

  it("uses '<attachment>' as preview when body is empty", async () => {
    const tid = seedThread();
    await sendMessage(tid, "u_a", {
      attachment_path: "uploads/x.jpg",
      attachment_kind: "image",
    });
    const ev = dispatchCalls[0];
    if (ev.type === "message.received") {
      assert.equal(ev.preview, "<attachment>");
    } else {
      assert.fail("expected message.received");
    }
  });

  it("trims preview to 80 chars", async () => {
    const tid = seedThread();
    const long = "x".repeat(200);
    await sendMessage(tid, "u_a", { body: long });
    const ev = dispatchCalls[0];
    if (ev.type === "message.received") {
      assert.equal(ev.preview.length, 80);
    } else {
      assert.fail("expected message.received");
    }
  });
});

describe("archiveThread", () => {
  it("sets archived_at on the thread", async () => {
    const tid = uuid();
    db.chat_threads.push({
      id: tid,
      booking_id: null,
      created_at: "",
      archived_at: null,
      last_message_at: null,
    });
    await archiveThread(tid);
    assert.ok(db.chat_threads[0].archived_at);
  });

  it("does not overwrite a prior archive timestamp", async () => {
    const tid = uuid();
    db.chat_threads.push({
      id: tid,
      booking_id: null,
      created_at: "",
      archived_at: null,
      last_message_at: null,
    });
    await archiveThread(tid);
    const first = db.chat_threads[0].archived_at;
    await new Promise((r) => setTimeout(r, 5));
    await archiveThread(tid);
    assert.equal(db.chat_threads[0].archived_at, first);
  });
});

describe("archiveThreadsForBooking", () => {
  it("archives matching threads, leaves others alone", async () => {
    db.chat_threads.push(
      {
        id: "t1",
        booking_id: "bk_match",
        created_at: "",
        archived_at: null,
        last_message_at: null,
      },
      {
        id: "t2",
        booking_id: "bk_other",
        created_at: "",
        archived_at: null,
        last_message_at: null,
      },
    );
    await archiveThreadsForBooking("bk_match");
    const t1 = db.chat_threads.find((t) => t.id === "t1");
    const t2 = db.chat_threads.find((t) => t.id === "t2");
    assert.ok(t1?.archived_at);
    assert.equal(t2?.archived_at, null);
  });
});

// Reset hooks at the end of the file so a stray test order doesn't
// leak the fake admin into other suites.
process.on("exit", () => __resetChatHooks());

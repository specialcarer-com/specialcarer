/**
 * P1-B10: moderation-wiring tests.
 *
 * Drives checkBanned / recordAutoFlags with a stubbed admin client so
 * the unit covers the branch logic without touching Supabase.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkBanned,
  recordAutoFlags,
  type ModerationAdminLike,
} from "./moderation-wiring";

type Captured = {
  inserts: { table: string; payload: unknown }[];
  updates: { table: string; payload: unknown; whereId?: string }[];
};

function makeAdmin(opts: {
  participant?: { banned_at: string | null } | null;
  participantError?: { message: string } | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  captured?: Captured;
}): ModerationAdminLike {
  const cap = opts.captured ?? { inserts: [], updates: [] };
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: opts.participant ?? null,
                        error: opts.participantError ?? null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
        async insert(payload: unknown) {
          cap.inserts.push({ table, payload });
          return { data: null, error: opts.insertError ?? null };
        },
        update(payload: unknown) {
          return {
            async eq(_col: string, val: string) {
              cap.updates.push({ table, payload, whereId: val });
              return { data: null, error: opts.updateError ?? null };
            },
          };
        },
      };
    },
  };
}

describe("checkBanned", () => {
  it("returns false when banned_at is null", async () => {
    const admin = makeAdmin({ participant: { banned_at: null } });
    assert.equal(await checkBanned(admin, "t", "u"), false);
  });

  it("returns true when banned_at is set", async () => {
    const admin = makeAdmin({
      participant: { banned_at: "2026-05-28T10:00:00Z" },
    });
    assert.equal(await checkBanned(admin, "t", "u"), true);
  });

  it("returns false when row is missing (not a participant)", async () => {
    const admin = makeAdmin({ participant: null });
    assert.equal(await checkBanned(admin, "t", "u"), false);
  });

  it("returns false on lookup error (best-effort)", async () => {
    const admin = makeAdmin({
      participant: null,
      participantError: { message: "db down" },
    });
    assert.equal(await checkBanned(admin, "t", "u"), false);
  });
});

describe("recordAutoFlags", () => {
  it("writes one flag per matched pattern", async () => {
    const cap: Captured = { inserts: [], updates: [] };
    const admin = makeAdmin({ captured: cap });
    const n = await recordAutoFlags(admin, {
      message_id: "m1",
      thread_id: "t1",
      body: "whatsapp me at 07123 456789",
    });
    assert.equal(n, 2); // uk_mobile + messaging_app_mention
    const insert = cap.inserts.find((c) => c.table === "chat_message_flags");
    assert.ok(insert, "expected a flag insert");
    const rows = insert!.payload as Array<{
      reason: string;
      detected_pattern: string;
      auto_detected: boolean;
      flagged_by: null;
    }>;
    assert.ok(rows.every((r) => r.auto_detected === true));
    assert.ok(rows.every((r) => r.flagged_by === null));
  });

  it("returns 0 and writes nothing when body has no matches", async () => {
    const cap: Captured = { inserts: [], updates: [] };
    const admin = makeAdmin({ captured: cap });
    const n = await recordAutoFlags(admin, {
      message_id: "m1",
      thread_id: "t1",
      body: "Hi! Looking forward to meeting you.",
    });
    assert.equal(n, 0);
    assert.equal(cap.inserts.length, 0);
    assert.equal(cap.updates.length, 0);
  });

  it("stamps flagged_at on the source message after a successful flag insert", async () => {
    const cap: Captured = { inserts: [], updates: [] };
    const admin = makeAdmin({ captured: cap });
    await recordAutoFlags(admin, {
      message_id: "m1",
      thread_id: "t1",
      body: "ping me on whatsapp",
    });
    const stamp = cap.updates.find((u) => u.table === "chat_messages");
    assert.ok(stamp, "expected flagged_at stamp on chat_messages");
    assert.equal(stamp!.whereId, "m1");
    const payload = stamp!.payload as { flagged_at: string };
    assert.ok(typeof payload.flagged_at === "string");
  });

  it("returns 0 when the insert errors (caller's send is already complete)", async () => {
    const cap: Captured = { inserts: [], updates: [] };
    const admin = makeAdmin({
      captured: cap,
      insertError: { message: "boom" },
    });
    const n = await recordAutoFlags(admin, {
      message_id: "m1",
      thread_id: "t1",
      body: "whatsapp me",
    });
    assert.equal(n, 0);
  });
});

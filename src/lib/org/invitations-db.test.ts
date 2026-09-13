/**
 * Tests for invitations-db.ts (Phase D — PR D1).
 *
 * Uses a small hand-rolled fake SupabaseClient — just enough surface
 * to exercise the schema_not_ready detection and the query shapes.
 * Full end-to-end integration against Supabase runs in staging.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { makeSupabaseInvitationsDb } from "./invitations-db";

/**
 * Minimal SupabaseClient stub: `.from(table)` returns a chainable
 * builder whose terminal awaits resolve to a `{data,error}` pair
 * configured per-test. `.rpc()` similarly.
 */
type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null; count?: number };
type Handler = (args: {
  table?: string;
  rpc?: string;
  filters: Record<string, unknown>;
  select?: string;
  isNull: string[];
  op: string;
  inserted?: Record<string, unknown>;
  updated?: Record<string, unknown>;
  rpcArgs?: Record<string, unknown>;
}) => QueryResult<unknown>;

function makeStub(handler: Handler): SupabaseClient {
  function builder(table: string) {
    const state = {
      table,
      filters: {} as Record<string, unknown>,
      select: undefined as string | undefined,
      isNull: [] as string[],
      op: "select",
      inserted: undefined as Record<string, unknown> | undefined,
      updated: undefined as Record<string, unknown> | undefined,
    };
    const chain = {
      select(sel?: string, opts?: { count?: string; head?: boolean }) {
        state.select = sel;
        if (opts?.head) state.op = state.op + "-head";
        return chain;
      },
      insert(row: Record<string, unknown>) {
        state.op = "insert";
        state.inserted = row;
        return chain;
      },
      update(row: Record<string, unknown>) {
        state.op = "update";
        state.updated = row;
        return chain;
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val;
        return chain;
      },
      is(col: string, val: unknown) {
        if (val === null) state.isNull.push(col);
        return chain;
      },
      lt(col: string, val: unknown) {
        state.filters[`${col}__lt`] = val;
        return chain;
      },
      limit() {
        return chain;
      },
      order() {
        return chain;
      },
      single() {
        return Promise.resolve(handler({ ...state }));
      },
      maybeSingle() {
        return Promise.resolve(handler({ ...state }));
      },
      then(resolve: (v: QueryResult<unknown>) => void) {
        resolve(handler({ ...state }));
      },
    };
    return chain;
  }
  const stub: unknown = {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(handler({ rpc: name, rpcArgs: args, filters: {}, isNull: [], op: "rpc" })),
  };
  return stub as SupabaseClient;
}

describe("makeSupabaseInvitationsDb — schema_not_ready translation", () => {
  test("isOrgAdmin returns schemaNotReady on PG 42P01", async () => {
    const client = makeStub(() => ({ data: null, error: { code: "42P01", message: "no such table" } }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.isOrgAdmin("u", "o");
    assert.deepEqual(res, { schemaNotReady: true });
  });

  test("isOrgAdmin returns admin:true for owner role", async () => {
    const client = makeStub(() => ({ data: { role: "owner" }, error: null }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.isOrgAdmin("u", "o");
    assert.deepEqual(res, { ok: true, admin: true });
  });

  test("isOrgAdmin returns admin:true for admin role", async () => {
    const client = makeStub(() => ({ data: { role: "admin" }, error: null }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.isOrgAdmin("u", "o");
    assert.deepEqual(res, { ok: true, admin: true });
  });

  test("isOrgAdmin returns admin:false for booker role", async () => {
    const client = makeStub(() => ({ data: { role: "booker" }, error: null }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.isOrgAdmin("u", "o");
    assert.deepEqual(res, { ok: true, admin: false });
  });

  test("insertInvitation returns schemaNotReady on 42P01", async () => {
    const client = makeStub(() => ({ data: null, error: { code: "42P01" } }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.insertInvitation({
      organization_id: "o",
      email: "e@x",
      role: "admin",
      invited_by: "u",
      token_hash: "h",
      expires_at: new Date().toISOString(),
    });
    assert.deepEqual(res, { schemaNotReady: true });
  });

  test("findByTokenHash returns row null when not found (no error)", async () => {
    const client = makeStub(() => ({ data: null, error: null }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.findByTokenHash("nope");
    assert.deepEqual(res, { ok: true, row: null });
  });

  test("acceptInvitationRpc surfaces unique_violation (23505) as alreadyMember", async () => {
    const client = makeStub(() => ({ data: null, error: { code: "23505" } }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.acceptInvitationRpc({
      invitation_id: "i", user_id: "u", organization_id: "o",
      role: "admin", full_name: null, work_email: "e@x",
    });
    assert.deepEqual(res, { ok: true, alreadyMember: true });
  });

  test("acceptInvitationRpc surfaces check_violation (23514) as not_acceptable_state", async () => {
    const client = makeStub(() => ({ data: null, error: { code: "23514" } }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.acceptInvitationRpc({
      invitation_id: "i", user_id: "u", organization_id: "o",
      role: "admin", full_name: null, work_email: "e@x",
    });
    assert.deepEqual(res, { ok: false, error: "not_acceptable_state" });
  });

  test("acceptInvitationRpc surfaces raised P0001 as not_acceptable_state", async () => {
    const client = makeStub(() => ({ data: null, error: { code: "P0001" } }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.acceptInvitationRpc({
      invitation_id: "i", user_id: "u", organization_id: "o",
      role: "admin", full_name: null, work_email: "e@x",
    });
    assert.deepEqual(res, { ok: false, error: "not_acceptable_state" });
  });

  test("countExpiredPending returns count from Supabase's { count } response", async () => {
    const client = makeStub(() => ({ data: null, error: null, count: 7 }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.countExpiredPending(new Date());
    assert.deepEqual(res, { ok: true, count: 7 });
  });

  test("countExpiredPending translates 42P01 to schemaNotReady", async () => {
    const client = makeStub(() => ({ data: null, error: { code: "42P01" } }));
    const db = makeSupabaseInvitationsDb(client);
    const res = await db.countExpiredPending(new Date());
    assert.deepEqual(res, { schemaNotReady: true });
  });
});

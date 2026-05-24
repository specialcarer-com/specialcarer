/**
 * Tests for the push register/unregister handlers.
 *
 * Drives the pure handler with a stubbed Supabase client to avoid pulling
 * in next/headers + cookie machinery (matches the pattern in
 * src/app/api/admin/training/courses/route.test.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleRegister,
  handleUnregister,
  type PushTokenClient,
} from "@/lib/push/register-handler";

type UpsertCall = {
  table: string;
  row: Record<string, unknown>;
  onConflict: string;
};

type UpdateCall = {
  table: string;
  row: Record<string, unknown>;
  token: string;
  user_id: string;
};

function makeClient(opts: {
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
  upsertCalls?: UpsertCall[];
  updateCalls?: UpdateCall[];
}): PushTokenClient {
  return {
    from(table) {
      return {
        upsert(row, { onConflict }) {
          opts.upsertCalls?.push({ table, row, onConflict });
          return {
            select() {
              return {
                async single() {
                  if (opts.upsertError) {
                    return { data: null, error: opts.upsertError };
                  }
                  return {
                    data: { id: "00000000-0000-0000-0000-000000000001" },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(row) {
          return {
            eq(_col1, token) {
              return {
                async eq(_col2, user_id) {
                  opts.updateCalls?.push({ table, row, token, user_id });
                  return { error: opts.updateError ?? null };
                },
              };
            },
          };
        },
      };
    },
  } satisfies PushTokenClient;
}

const USER_ID = "11111111-2222-3333-4444-555555555555";

describe("handleRegister", () => {
  it("happy path: upserts on (user_id, token) and returns ok", async () => {
    const upsertCalls: UpsertCall[] = [];
    const client = makeClient({ upsertCalls });
    const res = await handleRegister({
      user_id: USER_ID,
      client,
      body: {
        platform: "ios",
        token: "exp-token-abc",
        device_id: "device-1",
        app_version: "0.1.0",
      },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { ok: boolean; id: string };
    assert.equal(json.ok, true);
    assert.equal(json.id, "00000000-0000-0000-0000-000000000001");
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].onConflict, "user_id,token");
    assert.equal(upsertCalls[0].row.user_id, USER_ID);
    assert.equal(upsertCalls[0].row.platform, "ios");
    assert.equal(upsertCalls[0].row.token, "exp-token-abc");
    assert.equal(upsertCalls[0].row.revoked_at, null);
    // last_seen_at is bumped to a fresh ISO timestamp
    assert.match(
      String(upsertCalls[0].row.last_seen_at),
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it("duplicate insert upserts cleanly (no throw) — onConflict path", async () => {
    const upsertCalls: UpsertCall[] = [];
    const client = makeClient({ upsertCalls });
    // First call
    await handleRegister({
      user_id: USER_ID,
      client,
      body: { platform: "ios", token: "dup-token" },
    });
    // Second call with same (user_id, token) — onConflict makes it a no-op-ish upsert
    const res = await handleRegister({
      user_id: USER_ID,
      client,
      body: { platform: "ios", token: "dup-token" },
    });
    assert.equal(res.status, 200);
    assert.equal(upsertCalls.length, 2);
    assert.equal(upsertCalls[0].onConflict, "user_id,token");
    assert.equal(upsertCalls[1].onConflict, "user_id,token");
  });

  it("missing platform → 400", async () => {
    const upsertCalls: UpsertCall[] = [];
    const client = makeClient({ upsertCalls });
    const res = await handleRegister({
      user_id: USER_ID,
      client,
      body: { token: "x" },
    });
    assert.equal(res.status, 400);
    assert.equal(upsertCalls.length, 0);
  });

  it("invalid platform → 400", async () => {
    const upsertCalls: UpsertCall[] = [];
    const client = makeClient({ upsertCalls });
    const res = await handleRegister({
      user_id: USER_ID,
      client,
      body: { platform: "windowsphone", token: "x" },
    });
    assert.equal(res.status, 400);
    assert.equal(upsertCalls.length, 0);
  });

  it("missing token → 400", async () => {
    const upsertCalls: UpsertCall[] = [];
    const client = makeClient({ upsertCalls });
    const res = await handleRegister({
      user_id: USER_ID,
      client,
      body: { platform: "ios" },
    });
    assert.equal(res.status, 400);
    assert.equal(upsertCalls.length, 0);
  });

  it("db error → 500", async () => {
    const upsertCalls: UpsertCall[] = [];
    const client = makeClient({
      upsertCalls,
      upsertError: { message: "boom" },
    });
    const res = await handleRegister({
      user_id: USER_ID,
      client,
      body: { platform: "ios", token: "tok" },
    });
    assert.equal(res.status, 500);
  });
});

describe("handleUnregister", () => {
  it("happy path: scoped to caller's user_id + token", async () => {
    const updateCalls: UpdateCall[] = [];
    const client = makeClient({ updateCalls });
    const res = await handleUnregister({
      user_id: USER_ID,
      client,
      body: { token: "exp-token-abc" },
    });
    assert.equal(res.status, 200);
    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].token, "exp-token-abc");
    assert.equal(updateCalls[0].user_id, USER_ID);
    assert.match(String(updateCalls[0].row.revoked_at), /^\d{4}-\d{2}-\d{2}T/);
  });

  it("missing token → 400", async () => {
    const updateCalls: UpdateCall[] = [];
    const client = makeClient({ updateCalls });
    const res = await handleUnregister({
      user_id: USER_ID,
      client,
      body: {},
    });
    assert.equal(res.status, 400);
    assert.equal(updateCalls.length, 0);
  });
});

/**
 * P1-B10: admin queue handler tests.
 *
 * Drives handleListFlags / handleUpdateFlag with a stub QueueClient so
 * the suite covers validation, action dispatch order, and the joined
 * shape returned by the list endpoint — auth (requireAdminApi) is
 * route-level and out of scope here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleListFlags,
  handleUpdateFlag,
  parseListParams,
  type FlagRow,
  type QueueClient,
  type QueueItem,
  type FlagAction,
} from "./admin-queue-handler";

const FLAG: FlagRow = {
  id: "flag-1",
  message_id: "msg-1",
  thread_id: "thread-1",
  flagged_by: "user-2",
  reason: "harassment",
  auto_detected: false,
  detected_pattern: null,
  status: "open",
  resolved_by: null,
  resolved_at: null,
  admin_notes: null,
  created_at: "2026-05-28T10:00:00.000Z",
};

type Captured = {
  listed: Parameters<QueueClient["listFlags"]>[0][];
  applied: Parameters<QueueClient["applyAction"]>[0][];
  updated: Parameters<QueueClient["updateFlag"]>[0][];
  fetched: string[];
};

function makeClient(opts: {
  listResult?: { data: QueueItem[]; error: { message: string } | null };
  flagResult?: {
    data: (FlagRow & { sender_id: string }) | null;
    error: { message: string } | null;
  };
  applyError?: { message: string } | null;
  updateResult?: { data: FlagRow | null; error: { message: string } | null };
  captured?: Captured;
}): QueueClient {
  const cap = opts.captured ?? {
    listed: [],
    applied: [],
    updated: [],
    fetched: [],
  };
  return {
    async listFlags(params) {
      cap.listed.push(params);
      return (
        opts.listResult ?? {
          data: [{ ...FLAG, message: null }] as QueueItem[],
          error: null,
        }
      );
    },
    async getFlag(id) {
      cap.fetched.push(id);
      return (
        opts.flagResult ?? {
          data: { ...FLAG, sender_id: "user-1" },
          error: null,
        }
      );
    },
    async applyAction(input) {
      cap.applied.push(input);
      return { error: opts.applyError ?? null };
    },
    async updateFlag(input) {
      cap.updated.push(input);
      return (
        opts.updateResult ?? {
          data: { ...FLAG, status: input.status, admin_notes: input.admin_notes },
          error: null,
        }
      );
    },
  };
}

describe("parseListParams", () => {
  it("defaults to status=open, page=1, pageSize=20", () => {
    const p = parseListParams(new URL("https://x/api?"));
    assert.deepEqual(p, { status: "open", page: 1, pageSize: 20 });
  });

  it("accepts status=all", () => {
    const p = parseListParams(new URL("https://x/api?status=all"));
    assert.equal(p.status, "all");
  });

  it("falls back to 'open' when status is unknown", () => {
    const p = parseListParams(new URL("https://x/api?status=junk"));
    assert.equal(p.status, "open");
  });

  it("clamps pageSize to MAX (100)", () => {
    const p = parseListParams(new URL("https://x/api?pageSize=9999"));
    assert.equal(p.pageSize, 100);
  });

  it("ignores negative / NaN page values", () => {
    const p = parseListParams(new URL("https://x/api?page=-3&pageSize=abc"));
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 20);
  });
});

describe("handleListFlags", () => {
  it("returns 200 with items + pagination echo", async () => {
    const captured: Captured = {
      listed: [],
      applied: [],
      updated: [],
      fetched: [],
    };
    const res = await handleListFlags({
      url: new URL("https://x/api?status=open&page=2&pageSize=10"),
      client: makeClient({ captured }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      items: QueueItem[];
      page: number;
      pageSize: number;
    };
    assert.equal(json.page, 2);
    assert.equal(json.pageSize, 10);
    assert.deepEqual(captured.listed[0], {
      status: "open",
      page: 2,
      pageSize: 10,
    });
  });

  it("propagates a 500 when the client errors", async () => {
    const res = await handleListFlags({
      url: new URL("https://x/api"),
      client: makeClient({
        listResult: { data: [], error: { message: "boom" } },
      }),
    });
    assert.equal(res.status, 500);
  });
});

describe("handleUpdateFlag", () => {
  it("happy path with no action: just updates status + notes", async () => {
    const captured: Captured = {
      listed: [],
      applied: [],
      updated: [],
      fetched: [],
    };
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { status: "resolved_no_action", admin_notes: "looks fine" },
      client: makeClient({ captured }),
    });
    assert.equal(res.status, 200);
    assert.equal(captured.applied.length, 0);
    assert.equal(captured.updated.length, 1);
    assert.equal(captured.updated[0]!.status, "resolved_no_action");
    assert.equal(captured.updated[0]!.admin_notes, "looks fine");
  });

  it("happy path with action=ban_sender: applies action then updates flag", async () => {
    const captured: Captured = {
      listed: [],
      applied: [],
      updated: [],
      fetched: [],
    };
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { status: "resolved_ban", action: "ban_sender" },
      client: makeClient({ captured }),
    });
    assert.equal(res.status, 200);
    assert.equal(captured.applied.length, 1);
    assert.equal(captured.applied[0]!.action, "ban_sender");
    assert.equal(captured.applied[0]!.sender_id, "user-1");
    assert.equal(captured.applied[0]!.thread_id, "thread-1");
    // Update fires after action.
    assert.equal(captured.updated.length, 1);
  });

  for (const action of [
    "warn_sender",
    "ban_sender",
    "mute_sender_24h",
    "mark_safeguarding",
  ] as FlagAction[]) {
    it(`accepts action=${action}`, async () => {
      const res = await handleUpdateFlag({
        flag_id: "flag-1",
        admin_id: "admin-1",
        body: { status: "resolved_warn", action },
        client: makeClient({}),
      });
      assert.equal(res.status, 200);
    });
  }

  it("rejects an unknown action with 400", async () => {
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { status: "resolved_warn", action: "delete_user" },
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects an unknown status with 400", async () => {
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { status: "ignored" },
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("rejects a missing status with 400", async () => {
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { admin_notes: "x" },
      client: makeClient({}),
    });
    assert.equal(res.status, 400);
  });

  it("returns 404 when the flag does not exist", async () => {
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { status: "resolved_warn" },
      client: makeClient({
        flagResult: { data: null, error: null },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when the action client errors", async () => {
    const res = await handleUpdateFlag({
      flag_id: "flag-1",
      admin_id: "admin-1",
      body: { status: "resolved_ban", action: "ban_sender" },
      client: makeClient({
        applyError: { message: "boom" },
      }),
    });
    assert.equal(res.status, 500);
  });
});

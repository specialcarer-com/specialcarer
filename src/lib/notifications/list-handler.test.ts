/**
 * Tests for the pure list/mark-read logic — no DB, no Next runtime.
 * Driven by a fake `ListQueryClient` that lets us script row sets and
 * unread counts, mirroring the node:test pattern used elsewhere.
 *
 * Covers:
 *   - pagination cursor advances and next_cursor is null on the last page
 *   - unread_count is what the client reports
 *   - cross-user reads — modelled by gating the fake on caller_id, so
 *     a userA query never returns userB rows (RLS-equivalent at this
 *     layer; the real policy is exercised by the migration in CI).
 *   - mark-read excludes the row from the unread set (recount drops)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeCursor,
  encodeCursor,
  listNotifications,
  parseLimit,
  type ListQueryClient,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./list-handler";
import type { NotificationRow } from "./types";

type Fixture = NotificationRow & { user_id: string };

function makeRow(i: number, userId = "user-a", read = false): Fixture {
  // Strictly decreasing timestamps so the ORDER BY created_at desc is
  // already correct in the fixture order.
  const t = new Date(Date.UTC(2026, 4, 20, 12, 0, 60 - i)).toISOString();
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    user_id: userId,
    type: "booking.confirmed",
    title: `Title ${i}`,
    body: `Body ${i}`,
    deeplink: null,
    payload: {},
    read_at: read ? t : null,
    created_at: t,
  };
}

function makeClient(rows: Fixture[], callerId: string): ListQueryClient {
  return {
    async fetchPage({ limit, cursor }) {
      // Filter by caller_id — simulates RLS.
      let visible = rows.filter((r) => r.user_id === callerId);
      if (cursor) {
        const cursorIdx = visible.findIndex(
          (r) => r.id === cursor.id && r.created_at === cursor.createdAt,
        );
        if (cursorIdx >= 0) visible = visible.slice(cursorIdx + 1);
        else {
          // Cursor points at a missing row — keep only strictly older.
          visible = visible.filter(
            (r) =>
              r.created_at < cursor.createdAt ||
              (r.created_at === cursor.createdAt && r.id < cursor.id),
          );
        }
      }
      return { rows: visible.slice(0, limit), error: null };
    },
    async fetchUnreadCount() {
      const count = rows.filter(
        (r) => r.user_id === callerId && r.read_at === null,
      ).length;
      return { count, error: null };
    },
  };
}

describe("listNotifications — pagination", () => {
  it("returns first page with next_cursor when more rows remain", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i + 1));
    const client = makeClient(rows, "user-a");
    const res = await listNotifications(client, { limit: "2" });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.data.items.length, 2);
    assert.equal(res.data.items[0].id, rows[0].id);
    assert.equal(res.data.items[1].id, rows[1].id);
    assert.notEqual(res.data.next_cursor, null);
    assert.equal(res.data.unread_count, 5);
  });

  it("cursor advances correctly across pages", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i + 1));
    const client = makeClient(rows, "user-a");
    const page1 = await listNotifications(client, { limit: "2" });
    assert.equal(page1.ok, true);
    if (!page1.ok) return;
    const page2 = await listNotifications(client, {
      limit: "2",
      cursor: page1.data.next_cursor,
    });
    assert.equal(page2.ok, true);
    if (!page2.ok) return;
    assert.equal(page2.data.items.length, 2);
    assert.equal(page2.data.items[0].id, rows[2].id);
    assert.equal(page2.data.items[1].id, rows[3].id);

    const page3 = await listNotifications(client, {
      limit: "2",
      cursor: page2.data.next_cursor,
    });
    assert.equal(page3.ok, true);
    if (!page3.ok) return;
    assert.equal(page3.data.items.length, 1);
    assert.equal(page3.data.next_cursor, null, "last page has no cursor");
  });

  it("rejects invalid cursors with 400", async () => {
    const client = makeClient([], "user-a");
    const res = await listNotifications(client, { cursor: "not-a-cursor" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 400);
  });

  it("clamps limit to MAX_LIMIT and defaults when absent", () => {
    assert.equal(parseLimit(null), DEFAULT_LIMIT);
    assert.equal(parseLimit("1000"), MAX_LIMIT);
    assert.equal(parseLimit("-1"), DEFAULT_LIMIT);
    assert.equal(parseLimit("abc"), DEFAULT_LIMIT);
    assert.equal(parseLimit("5"), 5);
  });
});

describe("listNotifications — unread_count semantics", () => {
  it("unread_count reflects rows with read_at is null", async () => {
    const rows = [
      makeRow(1, "user-a", false),
      makeRow(2, "user-a", true),
      makeRow(3, "user-a", false),
    ];
    const res = await listNotifications(makeClient(rows, "user-a"), {});
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.data.unread_count, 2);
  });

  it("marking a notification read drops it from unread_count", async () => {
    const rows = [makeRow(1, "user-a", false), makeRow(2, "user-a", false)];
    const before = await listNotifications(makeClient(rows, "user-a"), {});
    assert.equal(before.ok, true);
    if (!before.ok) return;
    assert.equal(before.data.unread_count, 2);

    // Simulate mark-read of row 1.
    rows[0].read_at = new Date().toISOString();
    const after = await listNotifications(makeClient(rows, "user-a"), {});
    assert.equal(after.ok, true);
    if (!after.ok) return;
    assert.equal(after.data.unread_count, 1);
    // Row itself is still in the list (mark-read doesn't delete).
    assert.equal(after.data.items.length, 2);
    assert.notEqual(after.data.items[0].read_at, null);
  });
});

describe("listNotifications — cross-user isolation (RLS-equivalent)", () => {
  it("user A never sees user B rows", async () => {
    const rows = [
      makeRow(1, "user-a", false),
      makeRow(2, "user-b", false),
      makeRow(3, "user-a", false),
      makeRow(4, "user-b", false),
    ];
    const asA = await listNotifications(makeClient(rows, "user-a"), {});
    const asB = await listNotifications(makeClient(rows, "user-b"), {});
    assert.equal(asA.ok && asB.ok, true);
    if (!asA.ok || !asB.ok) return;
    assert.equal(asA.data.items.length, 2);
    assert.equal(asB.data.items.length, 2);
    assert.equal(asA.data.unread_count, 2);
    assert.equal(asB.data.unread_count, 2);
    // No overlap in returned ids.
    const aIds = new Set(asA.data.items.map((n) => n.id));
    for (const b of asB.data.items) assert.equal(aIds.has(b.id), false);
  });
});

describe("cursor codec", () => {
  it("round-trips", () => {
    const c = encodeCursor("2026-05-20T10:00:00.000Z", "abc-id");
    const d = decodeCursor(c);
    assert.deepEqual(d, {
      createdAt: "2026-05-20T10:00:00.000Z",
      id: "abc-id",
    });
  });
  it("rejects malformed cursors", () => {
    assert.equal(decodeCursor("nopipe"), null);
    assert.equal(decodeCursor("|just-id"), null);
    assert.equal(decodeCursor("ts-only|"), null);
    assert.equal(decodeCursor("not-a-date|id"), null);
  });
});

import type {
  ApiNotification,
  ApiNotificationsListResponse,
  NotificationRow,
} from "./types";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

/**
 * Keyset cursor format: ISO timestamp of the last row's `created_at`
 * concatenated with its id, e.g. "2026-05-20T10:00:00.000Z|<uuid>".
 *
 * Using (created_at, id) keeps pagination stable when two rows land
 * in the same millisecond — id breaks the tie deterministically.
 */
export function encodeCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function decodeCursor(
  cursor: string,
): { createdAt: string; id: string } | null {
  const idx = cursor.indexOf("|");
  if (idx <= 0) return null;
  const createdAt = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  if (!createdAt || !id) return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

export function parseLimit(raw: string | null | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Minimal contract the handler needs from supabase — kept narrow so
 * tests can hand in a fake without depending on @supabase/supabase-js.
 */
export type ListQueryClient = {
  fetchPage(args: {
    limit: number;
    cursor: { createdAt: string; id: string } | null;
  }): Promise<{ rows: NotificationRow[]; error: string | null }>;
  fetchUnreadCount(): Promise<{ count: number; error: string | null }>;
};

export type ListResult =
  | { ok: true; data: ApiNotificationsListResponse }
  | { ok: false; status: number; error: string };

export async function listNotifications(
  client: ListQueryClient,
  params: { cursor?: string | null; limit?: string | null },
): Promise<ListResult> {
  const limit = parseLimit(params.limit);
  let decoded: { createdAt: string; id: string } | null = null;
  if (params.cursor) {
    decoded = decodeCursor(params.cursor);
    if (!decoded) {
      return { ok: false, status: 400, error: "invalid_cursor" };
    }
  }

  // Fetch limit + 1 so we know whether another page exists without a
  // second round-trip.
  const { rows, error } = await client.fetchPage({
    limit: limit + 1,
    cursor: decoded,
  });
  if (error) return { ok: false, status: 500, error };

  let nextCursor: string | null = null;
  const slice = rows.slice(0, limit);
  if (rows.length > limit) {
    const last = slice[slice.length - 1];
    nextCursor = encodeCursor(last.created_at, last.id);
  }

  const items: ApiNotification[] = slice.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    deeplink: r.deeplink,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    read_at: r.read_at,
    created_at: r.created_at,
  }));

  const { count, error: unreadErr } = await client.fetchUnreadCount();
  if (unreadErr) return { ok: false, status: 500, error: unreadErr };

  return {
    ok: true,
    data: { items, next_cursor: nextCursor, unread_count: count },
  };
}

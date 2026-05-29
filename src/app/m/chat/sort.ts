/**
 * P1-B9.4: pinned-first thread-list sort.
 *
 * Stable secondary order is intentionally NOT enforced here — the caller
 * passes the list in the order it wants the within-group sort to take
 * (today: existing recency-ordered mock list). When the list is wired to
 * a real `GET /api/m/chat/threads` (TODO(b9.4-list-sort): swap mock for
 * the live query) the SQL clause `ORDER BY pinned DESC, COALESCE(
 * last_message_at, created_at) DESC` produces the same shape and this
 * helper can be deleted in favour of trusting the server.
 */
export type PinnableThread = { pinned?: boolean };

export function sortPinnedFirst<T extends PinnableThread>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    return bp - ap;
  });
}

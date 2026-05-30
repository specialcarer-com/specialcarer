/**
 * Pure handler for GET /api/m/chat/threads — the seeker/carer's thread
 * list, sorted server-side and shaped for the list page.
 *
 * Sort order matches the brief's SQL clause:
 *   ORDER BY (archived_at is null) desc,   -- live threads above archived
 *            pinned desc,                  -- pinned float to top
 *            coalesce(last_message_at, created_at) desc
 *
 * There is no `last_message_at` column on chat_threads, so it's derived
 * from the newest visible message per thread. Aggregation is done in JS
 * (one batched query per "side", no N+1) to stay on the user/admin
 * Supabase clients without adding a Postgres RPC + migration — the same
 * approach getUnreadThreadIdsWith already uses in server.ts.
 *
 * Authorization (auth + "rows belong to me") is handled at the route
 * boundary by scoping the participant lookup to the caller; this handler
 * just assembles and sorts whatever the injected client returns.
 */
import { NextResponse } from "next/server";

export type ThreadListRole = "seeker" | "carer" | "family" | "admin";

/** A thread row as returned to the list page. */
export type ThreadListItem = {
  id: string;
  booking_id: string;
  pinned: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  participant_count: number;
  /** The caller's role on this thread. */
  viewer_role: ThreadListRole;
  /** Display summary of the *other* party (carer for a seeker, etc.). */
  counterpart_name: string | null;
  counterpart_avatar_url: string | null;
};

export type ListClient = {
  /** Active participant rows for the caller — one per thread they're in. */
  myParticipantRows(userId: string): Promise<{
    data:
      | {
          thread_id: string;
          role: ThreadListRole;
          last_read_at: string | null;
        }[]
      | null;
    error: { message: string } | null;
  }>;
  /** chat_threads rows for the given ids. */
  threadsByIds(threadIds: string[]): Promise<{
    data:
      | {
          id: string;
          booking_id: string;
          pinned: boolean;
          archived_at: string | null;
          archived_reason: string | null;
          created_at: string;
        }[]
      | null;
    error: { message: string } | null;
  }>;
  /** Visible messages for the given threads (kind in message/system). */
  visibleMessages(threadIds: string[]): Promise<{
    data:
      | {
          thread_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        }[]
      | null;
    error: { message: string } | null;
  }>;
  /** All active participants (incl. names) for the given threads. */
  participantsForThreads(threadIds: string[]): Promise<{
    data:
      | {
          thread_id: string;
          user_id: string;
          role: ThreadListRole;
          display_name: string | null;
          avatar_url: string | null;
        }[]
      | null;
    error: { message: string } | null;
  }>;
};

const PREVIEW_LEN = 80;

/**
 * Sort comparator matching the SQL `ORDER BY`. Exported so the test can
 * assert it directly without standing up a fake client.
 */
export function compareThreads(a: ThreadListItem, b: ThreadListItem): number {
  // live (archived_at null) before archived
  const aLive = a.archived_at === null ? 1 : 0;
  const bLive = b.archived_at === null ? 1 : 0;
  if (aLive !== bLive) return bLive - aLive;
  // pinned before unpinned
  const ap = a.pinned ? 1 : 0;
  const bp = b.pinned ? 1 : 0;
  if (ap !== bp) return bp - ap;
  // most recent activity first
  const at = a.last_message_at ?? "";
  const bt = b.last_message_at ?? "";
  if (at < bt) return 1;
  if (at > bt) return -1;
  return 0;
}

export async function handleListThreads(input: {
  user_id: string;
  client: ListClient;
}): Promise<NextResponse<{ threads: ThreadListItem[] } | { error: string }>> {
  const { user_id, client } = input;

  const mine = await client.myParticipantRows(user_id);
  if (mine.error) {
    return NextResponse.json(
      { error: mine.error.message ?? "chat_threads_failed" },
      { status: 500 },
    );
  }
  const myRows = mine.data ?? [];
  if (myRows.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  const threadIds = myRows.map((r) => r.thread_id);
  const roleByThread = new Map<string, ThreadListRole>();
  const lastReadByThread = new Map<string, string | null>();
  for (const r of myRows) {
    roleByThread.set(r.thread_id, r.role);
    lastReadByThread.set(r.thread_id, r.last_read_at);
  }

  const [threadsRes, msgsRes, partsRes] = await Promise.all([
    client.threadsByIds(threadIds),
    client.visibleMessages(threadIds),
    client.participantsForThreads(threadIds),
  ]);
  if (threadsRes.error) {
    return NextResponse.json(
      { error: threadsRes.error.message ?? "chat_threads_failed" },
      { status: 500 },
    );
  }
  if (msgsRes.error) {
    return NextResponse.json(
      { error: msgsRes.error.message ?? "chat_threads_failed" },
      { status: 500 },
    );
  }
  if (partsRes.error) {
    return NextResponse.json(
      { error: partsRes.error.message ?? "chat_threads_failed" },
      { status: 500 },
    );
  }

  // Newest visible message per thread + unread tally.
  const lastMsgByThread = new Map<
    string,
    { created_at: string; body: string }
  >();
  const unreadByThread = new Map<string, number>();
  for (const m of msgsRes.data ?? []) {
    const prev = lastMsgByThread.get(m.thread_id);
    if (!prev || m.created_at > prev.created_at) {
      lastMsgByThread.set(m.thread_id, {
        created_at: m.created_at,
        body: m.body,
      });
    }
    const lastRead = lastReadByThread.get(m.thread_id) ?? null;
    const isIncoming = m.sender_id !== user_id;
    const isUnread = isIncoming && (!lastRead || m.created_at > lastRead);
    if (isUnread) {
      unreadByThread.set(
        m.thread_id,
        (unreadByThread.get(m.thread_id) ?? 0) + 1,
      );
    }
  }

  // Participant count + counterpart (first non-viewer participant).
  const countByThread = new Map<string, number>();
  const counterpartByThread = new Map<
    string,
    { name: string | null; avatar_url: string | null }
  >();
  for (const p of partsRes.data ?? []) {
    countByThread.set(p.thread_id, (countByThread.get(p.thread_id) ?? 0) + 1);
    if (p.user_id !== user_id && !counterpartByThread.has(p.thread_id)) {
      counterpartByThread.set(p.thread_id, {
        name: p.display_name,
        avatar_url: p.avatar_url,
      });
    }
  }

  const items: ThreadListItem[] = (threadsRes.data ?? []).map((t) => {
    const lastMsg = lastMsgByThread.get(t.id);
    const counterpart = counterpartByThread.get(t.id);
    return {
      id: t.id,
      booking_id: t.booking_id,
      pinned: t.pinned,
      archived_at: t.archived_at,
      archived_reason: t.archived_reason,
      last_message_at: lastMsg?.created_at ?? null,
      last_message_preview: lastMsg
        ? lastMsg.body.slice(0, PREVIEW_LEN)
        : null,
      unread_count: unreadByThread.get(t.id) ?? 0,
      participant_count: countByThread.get(t.id) ?? 0,
      viewer_role: roleByThread.get(t.id) ?? "seeker",
      counterpart_name: counterpart?.name ?? null,
      counterpart_avatar_url: counterpart?.avatar_url ?? null,
    };
  });

  items.sort(compareThreads);
  return NextResponse.json({ threads: items });
}

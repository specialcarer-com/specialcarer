/**
 * Pure handler for GET /api/m/chat/threads/[threadId] — the thread
 * detail header: the thread row, the caller's role, a booking summary,
 * and the counterpart (other party) for the avatar + title.
 *
 * 403 if the caller is not an active participant. Authorization is the
 * handler's job here (unlike the list, which is implicitly scoped) so it
 * can return 403 vs 200 from a single role lookup.
 */
import { NextResponse } from "next/server";

export type DetailRole = "seeker" | "carer" | "family" | "admin";

export type ThreadDetail = {
  id: string;
  booking_id: string;
  pinned: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  viewer_role: DetailRole;
  counterpart_name: string | null;
  counterpart_avatar_url: string | null;
  booking: {
    service_type: string | null;
    starts_at: string | null;
    status: string | null;
  } | null;
};

export type DetailClient = {
  /** The caller's active role on this thread, or null if not active. */
  myRole(
    threadId: string,
    userId: string,
  ): Promise<{ role: DetailRole | null; error: { message: string } | null }>;
  thread(threadId: string): Promise<{
    data:
      | {
          id: string;
          booking_id: string;
          pinned: boolean;
          archived_at: string | null;
          archived_reason: string | null;
        }
      | null;
    error: { message: string } | null;
  }>;
  /** First active participant other than the caller (name + avatar). */
  counterpart(
    threadId: string,
    userId: string,
  ): Promise<{
    data: { display_name: string | null; avatar_url: string | null } | null;
    error: { message: string } | null;
  }>;
  booking(bookingId: string): Promise<{
    data:
      | {
          service_type: string | null;
          starts_at: string | null;
          status: string | null;
        }
      | null;
    error: { message: string } | null;
  }>;
};

export async function handleThreadDetail(input: {
  thread_id: string;
  user_id: string;
  client: DetailClient;
}): Promise<NextResponse<{ thread: ThreadDetail } | { error: string }>> {
  const { thread_id, user_id, client } = input;

  const roleRes = await client.myRole(thread_id, user_id);
  if (roleRes.error) {
    return NextResponse.json(
      { error: roleRes.error.message ?? "chat_thread_failed" },
      { status: 500 },
    );
  }
  if (roleRes.role === null) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const threadRes = await client.thread(thread_id);
  if (threadRes.error) {
    return NextResponse.json(
      { error: threadRes.error.message ?? "chat_thread_failed" },
      { status: 500 },
    );
  }
  if (!threadRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [counterpartRes, bookingRes] = await Promise.all([
    client.counterpart(thread_id, user_id),
    client.booking(threadRes.data.booking_id),
  ]);

  const detail: ThreadDetail = {
    id: threadRes.data.id,
    booking_id: threadRes.data.booking_id,
    pinned: threadRes.data.pinned,
    archived_at: threadRes.data.archived_at,
    archived_reason: threadRes.data.archived_reason,
    viewer_role: roleRes.role,
    counterpart_name: counterpartRes.data?.display_name ?? null,
    counterpart_avatar_url: counterpartRes.data?.avatar_url ?? null,
    booking: bookingRes.data ?? null,
  };
  return NextResponse.json({ thread: detail });
}

/**
 * Server-side chat operations.
 *
 * Reads use the per-request supabase client (RLS-scoped). Writes that
 * cross participants (sendMessage, archiveThread, getOrCreateBookingThread)
 * use the admin client so we can fan out dispatch() to peers without
 * leaking visibility constraints into the route layer.
 */
import { createAdminClient as realAdmin } from "@/lib/supabase/admin";
import { createClient as realServer } from "@/lib/supabase/server";
import { dispatch as realDispatch } from "@/lib/push/notify";
import type { PushEvent } from "@/lib/push/notify";
import type {
  ListMessagesResult,
  ListThreadsResult,
  Message,
  Participant,
  ParticipantRole,
  SendMessageInput,
  Thread,
  ThreadListItem,
} from "./types";

const MAX_BODY_CHARS = 4000;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// Test seam: server-side callers always get the real clients +
// dispatcher; the test harness overrides via __setHooks before each
// case so we can drive the in-memory fake without spinning up
// node-test module mocks.
type AdminClient = ReturnType<typeof realAdmin>;
type ServerClient = Awaited<ReturnType<typeof realServer>>;
type Dispatcher = (event: PushEvent) => Promise<unknown>;
type Hooks = {
  createAdminClient: () => AdminClient;
  createServerClient: () => Promise<ServerClient>;
  dispatch: Dispatcher;
};
const hooks: Hooks = {
  createAdminClient: () => realAdmin(),
  createServerClient: () => realServer(),
  dispatch: (e) => realDispatch(e),
};
function createAdminClient(): AdminClient {
  return hooks.createAdminClient();
}
async function createClient(): Promise<ServerClient> {
  return hooks.createServerClient();
}
async function dispatch(event: PushEvent): Promise<unknown> {
  return hooks.dispatch(event);
}

/** @internal test-only */
export function __setChatHooks(overrides: Partial<Hooks>): void {
  Object.assign(hooks, overrides);
}
/** @internal test-only */
export function __resetChatHooks(): void {
  hooks.createAdminClient = () => realAdmin();
  hooks.createServerClient = () => realServer();
  hooks.dispatch = (e) => realDispatch(e);
}

function clampLimit(raw: number | undefined): number {
  if (!raw || !Number.isFinite(raw)) return DEFAULT_LIMIT;
  const n = Math.trunc(raw);
  if (n <= 0) return DEFAULT_LIMIT;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

type BookingPeersRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
};

/**
 * Find an existing thread for this booking, or create one and seat both
 * seeker + carer as participants. Idempotent: concurrent calls land on
 * the same thread thanks to the booking_id lookup + race-safe re-read.
 *
 * `user_id` is the caller — used only to authorise the lookup: the user
 * must be one of the booking's parties or the call returns null.
 */
export async function getOrCreateBookingThread(
  booking_id: string,
  user_id: string,
): Promise<Thread | null> {
  const admin = createAdminClient();

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id")
    .eq("id", booking_id)
    .maybeSingle<BookingPeersRow>();
  if (bookingErr || !booking) return null;
  if (!booking.caregiver_id) return null;
  if (booking.seeker_id !== user_id && booking.caregiver_id !== user_id) {
    return null;
  }

  const { data: existing } = await admin
    .from("chat_threads")
    .select("id, booking_id, created_at, archived_at, last_message_at")
    .eq("booking_id", booking_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<Thread>();
  if (existing) return existing;

  const { data: created, error: createErr } = await admin
    .from("chat_threads")
    .insert({ booking_id })
    .select("id, booking_id, created_at, archived_at, last_message_at")
    .single<Thread>();
  if (createErr || !created) {
    // Race: someone else just inserted. Re-read.
    const { data: raced } = await admin
      .from("chat_threads")
      .select("id, booking_id, created_at, archived_at, last_message_at")
      .eq("booking_id", booking_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<Thread>();
    if (raced) return raced;
    return null;
  }

  const seats: { thread_id: string; user_id: string; role: ParticipantRole }[] = [
    { thread_id: created.id, user_id: booking.seeker_id, role: "seeker" },
    { thread_id: created.id, user_id: booking.caregiver_id, role: "carer" },
  ];
  await admin
    .from("chat_participants")
    .upsert(seats, { onConflict: "thread_id,user_id" });

  return created;
}

type ListThreadsOpts = { cursor?: string | null; limit?: number };

/**
 * List threads where the caller is a participant, newest first by
 * last_message_at (nulls last via created_at fallback). Keyset
 * paginated: cursor is the ISO timestamp of the last row's
 * last_message_at (or created_at when null).
 */
export async function listThreads(
  user_id: string,
  opts: ListThreadsOpts = {},
): Promise<ListThreadsResult> {
  const admin = createAdminClient();
  const limit = clampLimit(opts.limit);

  type SeatRow = { thread_id: string; user_id: string; last_read_at: string | null };
  const { data: seats } = await admin
    .from("chat_participants")
    .select("thread_id, user_id, last_read_at")
    .eq("user_id", user_id);
  const seatRows = (seats ?? []) as SeatRow[];
  if (seatRows.length === 0) {
    return { items: [], next_cursor: null };
  }
  const ownedIds = seatRows.map((s) => s.thread_id);
  const lastReadByThread = new Map<string, string | null>(
    seatRows.map((s) => [s.thread_id, s.last_read_at]),
  );

  let threadsQuery = admin
    .from("chat_threads")
    .select("id, booking_id, created_at, archived_at, last_message_at")
    .in("id", ownedIds)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts.cursor) {
    threadsQuery = threadsQuery.lt("last_message_at", opts.cursor);
  }
  const { data: threadsData } = await threadsQuery;
  const threads = (threadsData ?? []) as Thread[];
  const page = threads.slice(0, limit);
  const next_cursor =
    threads.length > limit && page.length > 0
      ? page[page.length - 1].last_message_at ?? page[page.length - 1].created_at
      : null;

  if (page.length === 0) {
    return { items: [], next_cursor };
  }

  const threadIds = page.map((t) => t.id);

  const [{ data: partsData }, { data: lastMsgsData }] = await Promise.all([
    admin
      .from("chat_participants")
      .select("thread_id, user_id, role, joined_at, last_read_at")
      .in("thread_id", threadIds),
    admin
      .from("chat_messages")
      .select("thread_id, sender_id, body, created_at")
      .in("thread_id", threadIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const partsByThread = new Map<string, Participant[]>();
  for (const p of (partsData ?? []) as Participant[]) {
    const arr = partsByThread.get(p.thread_id) ?? [];
    arr.push(p);
    partsByThread.set(p.thread_id, arr);
  }

  type LastMsgRow = {
    thread_id: string;
    sender_id: string;
    body: string | null;
    created_at: string;
  };
  const lastMsgByThread = new Map<
    string,
    { body: string | null; sender_id: string; created_at: string }
  >();
  for (const m of (lastMsgsData ?? []) as LastMsgRow[]) {
    if (!lastMsgByThread.has(m.thread_id)) {
      lastMsgByThread.set(m.thread_id, {
        body: m.body,
        sender_id: m.sender_id,
        created_at: m.created_at,
      });
    }
  }

  // Unread = messages in this thread newer than the caller's last_read_at
  // AND not sent by the caller.
  const unreadCounts = new Map<string, number>();
  await Promise.all(
    page.map(async (t) => {
      const lastRead = lastReadByThread.get(t.id) ?? null;
      let q = admin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", t.id)
        .is("deleted_at", null)
        .neq("sender_id", user_id);
      if (lastRead) q = q.gt("created_at", lastRead);
      const { count } = await q;
      unreadCounts.set(t.id, count ?? 0);
    }),
  );

  const items: ThreadListItem[] = page.map((t) => ({
    ...t,
    participants: partsByThread.get(t.id) ?? [],
    last_message: lastMsgByThread.get(t.id) ?? null,
    unread_count: unreadCounts.get(t.id) ?? 0,
  }));

  return { items, next_cursor };
}

type ListMessagesOpts = { cursor?: string | null; limit?: number };

/**
 * Keyset-paginated messages for a thread, newest first. Cursor is the
 * created_at of the last row from the previous page. Excludes
 * soft-deleted rows.
 *
 * RLS gates visibility: a non-participant gets an empty page.
 */
export async function listMessages(
  thread_id: string,
  opts: ListMessagesOpts = {},
): Promise<ListMessagesResult> {
  const supabase = await createClient();
  const limit = clampLimit(opts.limit);

  let q = supabase
    .from("chat_messages")
    .select(
      "id, thread_id, sender_id, body, attachment_path, attachment_kind, created_at, deleted_at",
    )
    .eq("thread_id", thread_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts.cursor) q = q.lt("created_at", opts.cursor);
  const { data } = await q;
  const rows = (data ?? []) as Message[];
  const page = rows.slice(0, limit);
  const next_cursor =
    rows.length > limit && page.length > 0
      ? page[page.length - 1].created_at
      : null;
  return { items: page, next_cursor };
}

/**
 * Insert a message, bump the thread's last_message_at, and dispatch a
 * push event for every OTHER participant. Returns the inserted row.
 *
 * Caller is responsible for verifying sender is a participant (we
 * still rely on RLS for the insert when the route uses the user's
 * client — but server.ts can also be invoked from trusted contexts).
 */
export async function sendMessage(
  thread_id: string,
  sender_id: string,
  input: SendMessageInput,
): Promise<Message> {
  const admin = createAdminClient();

  const body = typeof input.body === "string" ? input.body.trim() : null;
  const trimmedBody = body && body.length > 0 ? body.slice(0, MAX_BODY_CHARS) : null;
  const attachment_path =
    typeof input.attachment_path === "string" && input.attachment_path.length > 0
      ? input.attachment_path
      : null;
  const attachment_kind = input.attachment_kind ?? null;

  if (!trimmedBody && !attachment_path) {
    throw new Error("sendMessage requires body or attachment_path");
  }

  const { data, error } = await admin
    .from("chat_messages")
    .insert({
      thread_id,
      sender_id,
      body: trimmedBody,
      attachment_path,
      attachment_kind,
    })
    .select(
      "id, thread_id, sender_id, body, attachment_path, attachment_kind, created_at, deleted_at",
    )
    .single<Message>();
  if (error || !data) {
    throw new Error(error?.message ?? "sendMessage insert returned no row");
  }

  await admin
    .from("chat_threads")
    .update({ last_message_at: data.created_at })
    .eq("id", thread_id);

  const { data: peersData } = await admin
    .from("chat_participants")
    .select("user_id")
    .eq("thread_id", thread_id);
  const peers = ((peersData ?? []) as { user_id: string }[])
    .map((p) => p.user_id)
    .filter((id) => id !== sender_id);

  const preview = trimmedBody ? trimmedBody.slice(0, 80) : "<attachment>";
  await Promise.all(
    peers.map((uid) =>
      dispatch({
        type: "message.received",
        user_id: uid,
        thread_id,
        preview,
      }).catch(() => {
        // dispatch failures must not poison the send; the push layer
        // logs its own structured warnings. Swallowing keeps the
        // chat path resilient when push infra is degraded.
      }),
    ),
  );

  return data;
}

/**
 * Bump the caller's last_read_at marker. Used to drop the unread
 * badge when the user opens a thread.
 */
export async function markRead(
  thread_id: string,
  user_id: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", thread_id)
    .eq("user_id", user_id);
}

/**
 * Soft-archive a thread. The row stays visible to participants but
 * moves to the "Archived" filter in the list view. Idempotent.
 */
export async function archiveThread(thread_id: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("chat_threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", thread_id)
    .is("archived_at", null);
}

/**
 * Archive every thread tied to this booking. Called from the
 * booking-status-transition handler when status becomes 'completed'.
 */
export async function archiveThreadsForBooking(
  booking_id: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("chat_threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("booking_id", booking_id)
    .is("archived_at", null);
}

export type { Thread, Participant, Message } from "./types";

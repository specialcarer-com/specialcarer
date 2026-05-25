/**
 * P0-A4-min: server-only helpers for booking-scoped chat.
 *
 * Threads are seeded by the service role (one per booking, seeker +
 * caregiver as participants). Listing and posting flow through the
 * user-scoped client so RLS does the participation check; read-tracking
 * uses the admin client because participants can't update their own
 * rows under the policy.
 *
 * Out of scope here (deferred to A4-bis): realtime subscription,
 * auto-archive on booking completion, the HTTP routes, and the UI page.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatch } from "@/lib/push/notify";

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ChatThread = {
  id: string;
  booking_id: string;
  archived_at: string | null;
  created_at: string;
};

export const MIN_BODY = 1;
export const MAX_BODY = 4000;

/** Trim+length-check the message body. Pulled out for unit testing. */
export function validateBody(body: unknown): string {
  if (typeof body !== "string") {
    throw new Error("chat_body_invalid");
  }
  const trimmed = body.trim();
  if (trimmed.length < MIN_BODY || trimmed.length > MAX_BODY) {
    throw new Error("chat_body_invalid");
  }
  return trimmed;
}

// Structural shape we use from the admin client: a `from(table)` entry
// point. Kept narrow so tests can drive it with a fake without pulling
// in the full PostgrestQueryBuilder generics. The chain shapes are
// covered by the runtime call pattern rather than the type signature.
export type AdminLike = { from: (table: string) => AdminTable };
type AdminTable = {
  select: (cols: string) => AdminFilter;
  insert: (payload: unknown) => AdminInsertChain;
  update?: (payload: unknown) => AdminUpdateChain;
};
type AdminFilter = {
  eq: (col: string, val: string) => AdminFilter & AdminTerminal;
};
type AdminInsertChain = {
  select: (cols: string) => AdminTerminal;
} & Promise<AdminResult>;
type AdminUpdateChain = {
  eq: (col: string, val: string) => AdminUpdateChain & Promise<AdminResult>;
  is: (col: string, val: null) => AdminUpdateChain & Promise<AdminResult>;
} & Promise<AdminResult>;
type AdminTerminal = {
  single: () => Promise<AdminResult>;
  maybeSingle: () => Promise<AdminResult>;
};
type AdminResult = {
  data: unknown;
  error: { message: string } | null;
};

/**
 * Look up the thread for a booking, creating it on first access.
 *
 * Throws `chat_no_carer_yet` when the booking has no caregiver yet —
 * the UI should hide the chat affordance until a carer is assigned.
 * Exported for direct testing with a fake admin client.
 */
export async function getOrCreateBookingThreadWith(
  admin: AdminLike,
  bookingId: string,
): Promise<ChatThread> {
  const existing = await admin
    .from("chat_threads")
    .select("id, booking_id, archived_at, created_at")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`chat_thread_lookup_failed: ${existing.error.message}`);
  }
  if (existing.data) {
    return existing.data as ChatThread;
  }

  const booking = await admin
    .from("bookings")
    .select("seeker_id, caregiver_id")
    .eq("id", bookingId)
    .single();
  if (booking.error || !booking.data) {
    throw new Error(
      `chat_booking_lookup_failed: ${booking.error?.message ?? "not found"}`,
    );
  }
  const { seeker_id, caregiver_id } = booking.data as {
    seeker_id: string;
    caregiver_id: string | null;
  };
  if (!caregiver_id) {
    throw new Error("chat_no_carer_yet");
  }

  const inserted = await admin
    .from("chat_threads")
    .insert({ booking_id: bookingId })
    .select("id, booking_id, archived_at, created_at")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(
      `chat_thread_insert_failed: ${inserted.error?.message ?? "no row"}`,
    );
  }
  const thread = inserted.data as ChatThread;

  const parts = await admin.from("chat_participants").insert([
    { thread_id: thread.id, user_id: seeker_id },
    { thread_id: thread.id, user_id: caregiver_id },
  ]);
  if (parts.error) {
    throw new Error(`chat_participants_insert_failed: ${parts.error.message}`);
  }
  return thread;
}

export async function getOrCreateBookingThread(
  bookingId: string,
): Promise<ChatThread> {
  return getOrCreateBookingThreadWith(
    createAdminClient() as unknown as AdminLike,
    bookingId,
  );
}

/**
 * Most recent `limit` messages in a thread, newest first. RLS on the
 * user-scoped client ensures only participants can read.
 */
export async function listMessages(
  threadId: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, thread_id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`chat_list_failed: ${error.message}`);
  }
  return (data ?? []) as ChatMessage[];
}

/**
 * Post a message as the calling user. RLS enforces participation and
 * sender_id = auth.uid(); we still resolve the user id client-side so
 * the insert payload is well-formed.
 */
export async function sendMessage(
  threadId: string,
  body: string,
): Promise<ChatMessage> {
  const trimmed = validateBody(body);
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("chat_unauthenticated");
  }
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      sender_id: userData.user.id,
      body: trimmed,
    })
    .select("id, thread_id, sender_id, body, created_at")
    .single();
  if (error || !data) {
    throw new Error(`chat_send_failed: ${error?.message ?? "no row"}`);
  }

  // Notify the other participant(s). RLS on chat_participants only
  // exposes own rows to authenticated callers, so use the admin client
  // for the lookup. Errors swallowed inside dispatch.
  try {
    const admin = createAdminClient();
    const { data: others } = await admin
      .from("chat_participants")
      .select("user_id")
      .eq("thread_id", threadId)
      .neq("user_id", userData.user.id);
    for (const p of (others ?? []) as { user_id: string }[]) {
      void dispatch({
        type: "message.received",
        recipientId: p.user_id,
        senderId: userData.user.id,
        threadId,
        preview: trimmed,
      });
    }
  } catch (e) {
    console.error("[chat.sendMessage] notify failed", e);
  }

  return data as ChatMessage;
}

/**
 * Stamp `last_read_at = now()` for the caller's participant row.
 *
 * Admin client because the participant RLS policy is read-only —
 * service role bypasses RLS, which is what we want for a server-side
 * read-tracking write the user explicitly initiates.
 */
export async function markRead(threadId: string): Promise<void> {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error("chat_unauthenticated");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("user_id", userData.user.id);
  if (error) {
    throw new Error(`chat_mark_read_failed: ${error.message}`);
  }
}

/**
 * True iff `userId` is a participant of `threadId`. Uses the admin
 * client because the chat_participants RLS policy only exposes the
 * caller's own rows, which is unhelpful for "are they a participant?"
 * defense-in-depth checks in route handlers.
 *
 * Exported with an injectable admin shape for unit testing.
 */
export async function isThreadParticipantWith(
  admin: AdminLike,
  threadId: string,
  userId: string,
): Promise<boolean> {
  const res = await admin
    .from("chat_participants")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (res.error) {
    return false;
  }
  return res.data !== null;
}

export async function isThreadParticipant(
  threadId: string,
  userId: string,
): Promise<boolean> {
  return isThreadParticipantWith(
    createAdminClient() as unknown as AdminLike,
    threadId,
    userId,
  );
}

/**
 * Stamp `archived_at = now()` on the thread for a booking that just
 * transitioned to `completed`. Idempotent (only archives if not already
 * archived). Errors are swallowed — the caller is the booking-complete
 * flow and must not be broken by a chat archive failure.
 *
 * Exported with an injectable admin shape for unit testing.
 */
export async function archiveBookingThreadWith(
  admin: AdminLike,
  bookingId: string,
): Promise<void> {
  try {
    const table = admin.from("chat_threads");
    if (!table.update) return;
    const update = table.update({ archived_at: new Date().toISOString() });
    await update.eq("booking_id", bookingId).is("archived_at", null);
  } catch (e) {
    console.error("[chat.archiveBookingThread] failed", e);
  }
}

export async function archiveBookingThread(bookingId: string): Promise<void> {
  try {
    return await archiveBookingThreadWith(
      createAdminClient() as unknown as AdminLike,
      bookingId,
    );
  } catch (e) {
    console.error("[chat.archiveBookingThread] failed", e);
  }
}

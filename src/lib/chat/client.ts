"use client";

/**
 * P0-A4-bis-2: browser-side helpers that wrap the chat HTTP routes.
 *
 * Kept thin on purpose — the routes already enforce auth + RLS, so this
 * module just shapes responses into a discriminated union the React
 * layer can pattern-match against without re-deriving HTTP semantics.
 */

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ChatThreadSummary = {
  id: string;
  booking_id: string;
  archived_at: string | null;
};

export type FetchThreadResult =
  | { ok: true; thread: ChatThreadSummary }
  | { ok: false; error: "no_carer_yet" | "unauthorized" | "unknown" };

export async function fetchThreadByBooking(
  bookingId: string,
): Promise<FetchThreadResult> {
  let res: Response;
  try {
    res = await fetch(
      `/api/m/chat/threads/by-booking/${encodeURIComponent(bookingId)}`,
      { credentials: "include", cache: "no-store" },
    );
  } catch {
    return { ok: false, error: "unknown" };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "unauthorized" };
  }
  if (res.status === 409) {
    // by-booking returns {error: "chat_no_carer_yet"} here.
    return { ok: false, error: "no_carer_yet" };
  }
  if (!res.ok) {
    return { ok: false, error: "unknown" };
  }
  try {
    const json = (await res.json()) as { thread: ChatThreadSummary };
    if (!json.thread) return { ok: false, error: "unknown" };
    return { ok: true, thread: json.thread };
  } catch {
    return { ok: false, error: "unknown" };
  }
}

/**
 * Fetch the most recent `limit` messages newest-first (matches what the
 * route returns). Callers that need ascending order should reverse on
 * arrival. Throws on transport error; callers catch and surface a toast.
 */
export async function fetchMessages(
  threadId: string,
  limit = 50,
): Promise<ChatMessage[]> {
  const res = await fetch(
    `/api/m/chat/threads/${encodeURIComponent(threadId)}/messages?limit=${limit}`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`chat_fetch_messages_failed_${res.status}`);
  }
  const json = (await res.json()) as { messages: ChatMessage[] };
  return json.messages ?? [];
}

export async function sendMessage(
  threadId: string,
  body: string,
): Promise<ChatMessage> {
  const res = await fetch(
    `/api/m/chat/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
  );
  if (!res.ok) {
    throw new Error(`chat_send_failed_${res.status}`);
  }
  const json = (await res.json()) as { message: ChatMessage };
  return json.message;
}

export async function markRead(threadId: string): Promise<void> {
  // Fire-and-forget semantically — but await so the caller can sequence
  // a follow-up fetch. Errors are swallowed: the caller is the UI, and
  // a failed read stamp is recoverable.
  try {
    await fetch(
      `/api/m/chat/threads/${encodeURIComponent(threadId)}/read`,
      { method: "POST", credentials: "include" },
    );
  } catch {
    /* ignore */
  }
}

export type RealtimeConfig = {
  config: { channelTopic: string; table: string; filter: string };
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export async function fetchRealtimeConfig(
  threadId: string,
): Promise<RealtimeConfig> {
  const res = await fetch(
    `/api/m/chat/threads/${encodeURIComponent(threadId)}/realtime`,
    { credentials: "include", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`chat_realtime_config_failed_${res.status}`);
  }
  return (await res.json()) as RealtimeConfig;
}

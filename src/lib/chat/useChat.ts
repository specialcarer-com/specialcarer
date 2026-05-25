"use client";

/**
 * P0-A4-bis-2: client hook that wires the chat HTTP routes + the
 * postgres_changes realtime channel together for a given booking.
 *
 * The hook returns a small state machine — `'loading' | 'no_carer_yet'
 * | 'ready' | 'error'` — and an append-only message buffer. Send is
 * optimistic in the sense that the response message is appended
 * immediately; the realtime INSERT event will arrive after and is
 * de-duped on `id`.
 *
 * The realtime channel + Supabase client are injected via a factory so
 * unit tests can drive the flow without depending on `@supabase/ssr`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  fetchMessages,
  fetchRealtimeConfig,
  fetchThreadByBooking,
  markRead as markReadCall,
  sendMessage as sendMessageCall,
  type ChatMessage,
  type FetchThreadResult,
  type RealtimeConfig,
} from "./client";

export type UseChatStatus = "loading" | "no_carer_yet" | "ready" | "error";

/**
 * Pure: append `incoming` to `prev` unless the id is already present.
 * Exposed for unit testing the de-dup invariant without spinning React.
 */
export function appendIfNew(
  prev: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (prev.some((m) => m.id === incoming.id)) return prev;
  return [...prev, incoming];
}

/**
 * Pure: map a `FetchThreadResult` to the corresponding hook status when
 * the thread fetch resolves with a non-ok outcome. Exposed so the state
 * transition can be unit-tested directly.
 */
export function statusForFetchThreadError(
  err: "no_carer_yet" | "unauthorized" | "unknown",
): UseChatStatus {
  return err === "no_carer_yet" ? "no_carer_yet" : "error";
}

export type UseChatState = {
  status: UseChatStatus;
  messages: ChatMessage[];
  threadId: string | null;
  archivedAt: string | null;
  send: (body: string) => Promise<void>;
  markRead: () => Promise<void>;
};

/**
 * Thin shape we need from a Supabase channel for realtime — enough to
 * mock in tests without dragging in the full SupabaseClient type. The
 * real client matches structurally.
 */
export type ChatChannelLike = {
  on: (
    event: "postgres_changes",
    filter: { event: "INSERT"; schema: string; table: string; filter: string },
    cb: (payload: { new: ChatMessage }) => void,
  ) => ChatChannelLike;
  subscribe: () => ChatChannelLike;
};

export type ChatRealtimeClientLike = {
  channel: (topic: string) => ChatChannelLike;
  removeChannel: (channel: ChatChannelLike) => unknown;
};

export type UseChatDeps = {
  fetchThread?: (bookingId: string) => Promise<FetchThreadResult>;
  fetchMessages?: (threadId: string, limit?: number) => Promise<ChatMessage[]>;
  fetchRealtimeConfig?: (threadId: string) => Promise<RealtimeConfig>;
  sendMessage?: (threadId: string, body: string) => Promise<ChatMessage>;
  markRead?: (threadId: string) => Promise<void>;
  /**
   * Build a Supabase-like realtime client from the per-thread config
   * payload. Returning `null` disables realtime (used by tests that
   * only care about HTTP state transitions).
   */
  buildRealtimeClient?: (cfg: RealtimeConfig) => ChatRealtimeClientLike | null;
};

const DEFAULT_DEPS: Required<Omit<UseChatDeps, "buildRealtimeClient">> & {
  buildRealtimeClient: (cfg: RealtimeConfig) => ChatRealtimeClientLike | null;
} = {
  fetchThread: fetchThreadByBooking,
  fetchMessages,
  fetchRealtimeConfig,
  sendMessage: sendMessageCall,
  markRead: markReadCall,
  buildRealtimeClient: (cfg: RealtimeConfig) => {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    return createBrowserClient(
      cfg.supabaseUrl,
      cfg.supabaseAnonKey,
    ) as unknown as ChatRealtimeClientLike;
  },
};

export function useChat(
  bookingId: string,
  depsOverride?: UseChatDeps,
): UseChatState {
  const deps = { ...DEFAULT_DEPS, ...(depsOverride ?? {}) };
  const [status, setStatus] = useState<UseChatStatus>("loading");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [archivedAt, setArchivedAt] = useState<string | null>(null);

  // Keep latest threadId/messages available to the realtime callback
  // without re-subscribing on every state change.
  const threadIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const appendMessage = useCallback((m: ChatMessage) => {
    if (seenIdsRef.current.has(m.id)) return;
    seenIdsRef.current.add(m.id);
    setMessages((prev) => appendIfNew(prev, m));
  }, []);

  // Bootstrap: thread → messages → realtime.
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    let removeChannel: (() => void) | null = null;

    (async () => {
      const threadRes = await deps.fetchThread(bookingId);
      if (cancelled) return;
      if (!threadRes.ok) {
        setStatus(statusForFetchThreadError(threadRes.error));
        return;
      }
      const thread = threadRes.thread;
      threadIdRef.current = thread.id;
      setThreadId(thread.id);
      setArchivedAt(thread.archived_at);

      let initialMessages: ChatMessage[];
      try {
        const newestFirst = await deps.fetchMessages(thread.id, 50);
        initialMessages = newestFirst.slice().reverse();
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) return;
      seenIdsRef.current = new Set(initialMessages.map((m) => m.id));
      setMessages(initialMessages);
      setStatus("ready");

      // Realtime subscription.
      try {
        const cfg = await deps.fetchRealtimeConfig(thread.id);
        if (cancelled) return;
        const client = deps.buildRealtimeClient(cfg);
        if (!client) return;
        const channel = client
          .channel(cfg.config.channelTopic)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: cfg.config.table,
              filter: cfg.config.filter,
            },
            (payload) => {
              appendMessage(payload.new);
            },
          )
          .subscribe();
        removeChannel = () => {
          try {
            client.removeChannel(channel);
          } catch {
            /* ignore */
          }
        };
      } catch {
        // Realtime is best-effort — initial fetch already populated the list.
      }
    })();

    return () => {
      cancelled = true;
      if (removeChannel) removeChannel();
    };
    // We intentionally only re-bootstrap when bookingId changes; deps is
    // a stable record built from module-level defaults + caller override.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const send = useCallback(
    async (body: string) => {
      const id = threadIdRef.current;
      if (!id) return;
      const trimmed = body.trim();
      if (trimmed.length === 0) return;
      const m = await deps.sendMessage(id, trimmed);
      appendMessage(m);
    },
    [appendMessage, deps],
  );

  const markRead = useCallback(async () => {
    const id = threadIdRef.current;
    if (!id) return;
    await deps.markRead(id);
  }, [deps]);

  return { status, messages, threadId, archivedAt, send, markRead };
}

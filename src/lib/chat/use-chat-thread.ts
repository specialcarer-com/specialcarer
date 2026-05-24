/**
 * Client hook for a single chat thread.
 *
 * Subscribes to a Supabase realtime channel scoped to this thread and
 * appends INSERTs as they arrive. Send/mark-read post to the API
 * routes. Optimistic UI: the sender sees their own message before the
 * INSERT echo lands, then the echo replaces the optimistic row.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, SendMessageInput } from "./types";

export type UseChatThreadResult = {
  messages: Message[];
  send: (input: SendMessageInput) => Promise<void>;
  markRead: () => Promise<void>;
  sending: boolean;
  error: string | null;
};

type SendApiResponse = { message: Message } | { error: string };

export function useChatThread(
  thread_id: string,
  initial: Message[],
  me: string,
): UseChatThreadResult {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef(new Set(initial.map((m) => m.id)));

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:thread_id=eq.${thread_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `thread_id=eq.${thread_id}`,
        },
        (payload) => {
          const row = payload.new as Message;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          setMessages((prev) => {
            // Drop any optimistic local-* row with same body+sender within
            // the last ~10s — the echo supersedes it.
            const echoTime = new Date(row.created_at).getTime();
            const next = prev.filter((m) => {
              if (!m.id.startsWith("local-")) return true;
              if (m.sender_id !== row.sender_id) return true;
              if ((m.body ?? "") !== (row.body ?? "")) return true;
              const localTime = new Date(m.created_at).getTime();
              return Math.abs(echoTime - localTime) > 10_000;
            });
            return [...next, row];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread_id]);

  const send = useCallback(
    async (input: SendMessageInput) => {
      if (sending) return;
      const body = (input.body ?? "").trim();
      const hasAttachment =
        typeof input.attachment_path === "string" &&
        input.attachment_path.length > 0;
      if (!body && !hasAttachment) return;

      setSending(true);
      setError(null);

      const optimistic: Message = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        thread_id,
        sender_id: me,
        body: body || null,
        attachment_path: input.attachment_path ?? null,
        attachment_kind: input.attachment_kind ?? null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/m/chat/${thread_id}/send`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: body || undefined,
            attachment_path: input.attachment_path ?? undefined,
            attachment_kind: input.attachment_kind ?? undefined,
          }),
        });
        const data = (await res.json()) as SendApiResponse;
        if (!res.ok || "error" in data) {
          const err = "error" in data ? data.error : "send failed";
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setError(err);
          return;
        }
        if (data.message && !seenIds.current.has(data.message.id)) {
          seenIds.current.add(data.message.id);
          setMessages((prev) => {
            const without = prev.filter((m) => m.id !== optimistic.id);
            const alreadyEcho = without.some((m) => m.id === data.message.id);
            return alreadyEcho ? without : [...without, data.message];
          });
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setError("network error");
      } finally {
        setSending(false);
      }
    },
    [thread_id, me, sending],
  );

  const markRead = useCallback(async () => {
    await fetch(`/api/m/chat/${thread_id}/mark-read`, { method: "POST" });
  }, [thread_id]);

  return { messages, send, markRead, sending, error };
}

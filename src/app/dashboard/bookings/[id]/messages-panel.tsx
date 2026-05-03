"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

const POLL_MS = 8_000;

export default function MessagesPanel({
  bookingId,
  currentUserId,
  counterpartyName,
}: {
  bookingId: string;
  currentUserId: string;
  counterpartyName: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as { messages: Message[] };
        setMessages(j.messages);
      }
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Send failed");
      }
      const j = (await res.json()) as { message: Message };
      setMessages((prev) => [...prev, j.message]);
      setDraft("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-8 p-5 rounded-2xl bg-white border border-slate-100">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Messages with {counterpartyName}</h2>
        {messages.length > 0 && (
          <span className="text-xs text-slate-500">{messages.length} total</span>
        )}
      </div>

      <div
        ref={listRef}
        className="mt-4 max-h-80 overflow-y-auto space-y-3 pr-1"
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500">
            No messages yet. Say hello — share parking notes, gate codes, or any
            last-minute details.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm ${
                    mine
                      ? "bg-brand text-white rounded-br-md"
                      : "bg-slate-100 text-slate-900 rounded-bl-md"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div
                    className={`mt-1 text-[10px] ${
                      mine ? "text-white/70" : "text-slate-500"
                    }`}
                  >
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={4000}
          placeholder="Type a message…"
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Messages are visible only to you and {counterpartyName}. Please keep
        conversations on platform — sharing personal contact details before booking
        is against our terms.
      </p>
    </div>
  );
}

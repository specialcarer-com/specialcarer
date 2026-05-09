"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/ai/types";

/**
 * Floating chat widget — bottom-right FAB, click to open a panel.
 * - POSTs /api/ai/chat/sessions once on open to create or reuse a
 *   session (surface=mobile).
 * - POST /api/ai/chat/messages to send.
 * - GET  /api/ai/chat/messages?session_id=… to load history.
 *
 * Escalation banner appears when the last bot message has
 * meta.escalated === true.
 */

const FAB_OFFSET_CLASS = "right-4 bottom-4 sc-safe-bottom";

type Props = {
  /** Override default surface (mobile). */
  surface?: "mobile" | "web" | "help-center";
};

export default function ChatTriageWidget({ surface = "mobile" }: Props) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Lazily create / fetch session on first open.
  useEffect(() => {
    if (!open || sessionId) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const res = await fetch("/api/ai/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface }),
        });
        if (!res.ok) {
          if (!cancelled)
            setErr("Chat is offline — please try again later.");
          return;
        }
        const j = (await res.json()) as { session: { id: string } };
        if (cancelled) return;
        setSessionId(j.session.id);
        // Load history for the session (may be empty).
        const hRes = await fetch(
          `/api/ai/chat/messages?session_id=${j.session.id}`,
          { cache: "no-store" },
        );
        if (hRes.ok) {
          const jh = (await hRes.json()) as { messages: ChatMessage[] };
          if (!cancelled) setMessages(jh.messages ?? []);
        }
      } catch {
        if (!cancelled)
          setErr("Chat is offline — please try again later.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, surface]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const text = body.trim();
    if (!text || !sessionId || busy) return;
    setBusy(true);
    setErr(null);
    // Optimistically append the user message. The server will
    // persist and return the bot reply.
    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      body: text,
      meta: {},
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setBody("");
    try {
      const res = await fetch("/api/ai/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, body: text }),
      });
      if (!res.ok) {
        setErr("Message failed. Please try again.");
        return;
      }
      // Re-fetch the full thread so we pick up the bot + any system
      // "connecting to human" line with the correct server timestamps.
      const hRes = await fetch(
        `/api/ai/chat/messages?session_id=${sessionId}`,
        { cache: "no-store" },
      );
      if (hRes.ok) {
        const jh = (await hRes.json()) as { messages: ChatMessage[] };
        setMessages(jh.messages ?? []);
      }
    } finally {
      setBusy(false);
    }
  }

  const lastBot = [...messages].reverse().find((m) => m.role === "bot");
  const escalated = !!(
    lastBot?.meta as { escalated?: boolean } | undefined
  )?.escalated;

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        className={`fixed z-40 ${FAB_OFFSET_CLASS} h-12 w-12 rounded-full bg-brand-700 text-white shadow-lg grid place-items-center hover:bg-brand-600 transition`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className={`fixed z-40 ${FAB_OFFSET_CLASS} w-[min(360px,calc(100vw-2rem))] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col`}
      style={{
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
        maxHeight: "min(72vh, 560px)",
      }}
      role="dialog"
      aria-label="Chat with SpecialCarer support"
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-900">Chat</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close chat"
          className="text-slate-500 hover:text-slate-800 text-lg leading-none"
        >
          ×
        </button>
      </header>

      {escalated && (
        <div className="px-3 py-1.5 bg-amber-50 text-amber-800 text-[11px] font-semibold">
          Connecting you to a human…
        </div>
      )}

      <div
        ref={viewportRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
      >
        {messages.length === 0 && !err && (
          <p className="text-xs text-slate-500 text-center py-6">
            Ask a question — I&rsquo;ll help or hand off to a human.
          </p>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} />
        ))}
        {err && (
          <p aria-live="polite" className="text-xs text-rose-700 mt-1">
            {err}
          </p>
        )}
      </div>

      <div className="px-2 py-2 border-t border-slate-100 flex gap-2">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message…"
          aria-label="Message"
          className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !body.trim() || !sessionId}
          className="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-semibold disabled:opacity-60"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function MessageRow({ m }: { m: ChatMessage }) {
  const isUser = m.role === "user";
  const isSystem = m.role === "system";
  const align = isUser
    ? "ml-auto bg-brand-700 text-white"
    : isSystem
      ? "bg-amber-50 text-amber-900 border border-amber-200"
      : "bg-slate-100 text-slate-900";
  return (
    <div
      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${align}`}
    >
      {m.body}
    </div>
  );
}

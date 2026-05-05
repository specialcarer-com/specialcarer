"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  IconSend,
  IconPhone,
  IconChevronLeft,
} from "../../_components/ui";
import { getChat, type ChatMessage } from "../../_lib/mock";

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const data = getChat(params.id);

  const [messages, setMessages] = useState<ChatMessage[]>(data?.thread ?? []);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!data || !data.carer) {
    return (
      <div className="min-h-screen bg-bg-screen p-6">
        <p className="text-sm text-subheading">Conversation not found.</p>
        <button
          onClick={() => router.push("/m/chat")}
          className="mt-4 text-sm font-medium text-primary"
        >
          Back to messages
        </button>
      </div>
    );
  }

  const { carer } = data;

  function send() {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${prev.length + 1}`,
        fromMe: true,
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setDraft("");
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-screen sc-keyboard-aware">
      {/* Custom header with avatar */}
      <div className="sc-safe-top sticky top-0 z-30 bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => router.push("/m/chat")}
            className="-ml-2 p-2 sc-no-select"
            aria-label="Back"
          >
            <IconChevronLeft />
          </button>
          <Avatar src={carer.photo} size={36} name={carer.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold text-heading">{carer.name}</p>
            <p className="text-[11px] text-primary">Online</p>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-muted text-heading"
            aria-label="Call"
          >
            <IconPhone />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto mb-4 w-fit rounded-full bg-muted px-3 py-1 text-[11px] text-subheading">
          Today
        </div>
        <ul className="flex flex-col gap-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`flex ${m.fromMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                  m.fromMe
                    ? "rounded-br-md bg-primary text-white"
                    : "rounded-bl-md bg-white text-heading shadow-card"
                }`}
              >
                <p className="text-[14.5px] leading-snug">{m.text}</p>
                <p
                  className={`mt-1 text-[10px] ${
                    m.fromMe ? "text-white/70" : "text-subheading"
                  }`}
                >
                  {m.time}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line bg-white px-4 py-3 sc-safe-bottom">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Type a message"
            className="max-h-32 flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-[15px] text-heading placeholder:text-subheading focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            className="grid h-11 w-11 place-items-center rounded-full bg-primary text-white shadow-card transition active:scale-95 disabled:bg-muted disabled:text-subheading"
            aria-label="Send"
          >
            <IconSend />
          </button>
        </div>
      </div>
    </div>
  );
}

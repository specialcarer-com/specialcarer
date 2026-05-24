"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  IconSend,
  IconPhone,
  IconChevronLeft,
} from "../../_components/ui";
import { useChatThread } from "@/lib/chat/use-chat-thread";
import type { Message } from "@/lib/chat/types";
import type { ApiThreadPeer } from "@/lib/chat/client";

type Props = {
  thread_id: string;
  me: string;
  peer: ApiThreadPeer | null;
  initial: Message[];
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatThreadClient({ thread_id, me, peer, initial }: Props) {
  const router = useRouter();
  const { messages, send, markRead } = useChatThread(thread_id, initial, me);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    void markRead();
  }, [markRead]);

  const peerName = peer?.display_name ?? "Conversation";
  const peerPhoto = peer?.photo_url ?? "";

  const sorted = useMemo(
    () =>
      [...messages].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
    [messages],
  );

  function onSubmit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send({ body: text });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-bg-screen sc-keyboard-aware">
      <div className="sc-safe-top sticky top-0 z-30 bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => router.push("/m/chat")}
            className="-ml-2 p-2 sc-no-select"
            aria-label="Back"
          >
            <IconChevronLeft />
          </button>
          <Avatar src={peerPhoto} size={36} name={peerName} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold text-heading">
              {peerName}
            </p>
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
          {sorted.map((m) => {
            const fromMe = m.sender_id === me;
            return (
              <li
                key={m.id}
                className={`flex ${fromMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                    fromMe
                      ? "rounded-br-md bg-primary text-white"
                      : "rounded-bl-md bg-white text-heading shadow-card"
                  }`}
                >
                  {m.body ? (
                    <p className="text-[14.5px] leading-snug">{m.body}</p>
                  ) : (
                    <p className="text-[12px] italic opacity-80">
                      [{m.attachment_kind ?? "attachment"}]
                    </p>
                  )}
                  <p
                    className={`mt-1 text-[10px] ${
                      fromMe ? "text-white/70" : "text-subheading"
                    }`}
                  >
                    {fmtTime(m.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
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
                onSubmit();
              }
            }}
            rows={1}
            placeholder="Type a message"
            className="max-h-32 flex-1 resize-none rounded-2xl bg-muted px-4 py-2.5 text-[15px] text-heading placeholder:text-subheading focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={onSubmit}
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

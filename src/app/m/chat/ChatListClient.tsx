"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TopBar, BottomNav, Avatar, IconSearch } from "../_components/ui";
import { createClient } from "@/lib/supabase/client";
import { fmtWhen, type ApiThreadListItem } from "@/lib/chat/client";

type Props = {
  me: string;
  initialItems: ApiThreadListItem[];
};

type Tab = "active" | "archived";

export default function ChatListClient({ me, initialItems }: Props) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("active");
  const [items, setItems] = useState<ApiThreadListItem[]>(initialItems);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-list:${me}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const row = payload.new as {
            thread_id: string;
            sender_id: string;
            body: string | null;
            created_at: string;
          };
          // RLS would normally scope this to the user's threads — fall
          // back to client-side filtering in case the realtime layer
          // ships rows we shouldn't bump.
          const idx = itemsRef.current.findIndex(
            (t) => t.id === row.thread_id,
          );
          if (idx < 0) return;
          setItems((prev) => {
            const next = [...prev];
            const t = next[idx];
            const isPeer = row.sender_id !== me;
            next[idx] = {
              ...t,
              last_message_at: row.created_at,
              last_message: {
                body: row.body,
                sender_id: row.sender_id,
                created_at: row.created_at,
              },
              unread_count: isPeer ? t.unread_count + 1 : t.unread_count,
            };
            next.sort((a, b) => {
              const ax = a.last_message_at ?? a.created_at;
              const bx = b.last_message_at ?? b.created_at;
              return bx.localeCompare(ax);
            });
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((t) => {
      const isArchived = t.archived_at != null;
      if (tab === "active" && isArchived) return false;
      if (tab === "archived" && !isArchived) return false;
      if (!term) return true;
      const name = t.peer?.display_name?.toLowerCase() ?? "";
      return name.includes(term);
    });
  }, [items, q, tab]);

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Messages" />
      <div className="px-5 pt-2">
        <label className="flex h-12 items-center gap-3 rounded-2xl bg-muted px-4">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations"
            className="flex-1 bg-transparent text-[15px] text-heading placeholder:text-subheading focus:outline-none"
          />
        </label>
        <div className="mt-3 flex gap-2">
          {(["active", "archived"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                tab === t
                  ? "bg-primary text-white"
                  : "bg-muted text-subheading"
              }`}
            >
              {t === "active" ? "Active" : "Archived"}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-line">
        {filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-subheading">
            {tab === "archived"
              ? "No archived conversations."
              : "No conversations yet."}
          </li>
        )}
        {filtered.map((t) => {
          const name = t.peer?.display_name ?? "Conversation";
          const photo = t.peer?.photo_url ?? null;
          const preview = t.last_message?.body ?? "";
          return (
            <li key={t.id}>
              <Link
                href={`/m/chat/${t.id}`}
                className="flex items-center gap-3 px-5 py-3 active:bg-muted/60"
              >
                <Avatar
                  src={photo ?? ""}
                  size={48}
                  name={name}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[15px] font-semibold text-heading">
                      {name}
                    </p>
                    <span className="shrink-0 text-xs text-subheading">
                      {fmtWhen(t.last_message_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-subheading">{preview}</p>
                    {t.unread_count > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <BottomNav active="chat" />
    </div>
  );
}

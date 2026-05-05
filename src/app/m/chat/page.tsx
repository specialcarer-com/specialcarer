"use client";

import Link from "next/link";
import { useState } from "react";
import { TopBar, BottomNav, Avatar, IconSearch } from "../_components/ui";
import { CHATS } from "../_lib/mock";
import { getCarer } from "../_lib/mock";

export default function ChatListPage() {
  const [q, setQ] = useState("");
  const filtered = CHATS.filter((c) => {
    const carer = getCarer(c.carerId);
    if (!carer) return false;
    return carer.name.toLowerCase().includes(q.toLowerCase());
  });

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
      </div>

      <ul className="mt-4 divide-y divide-line">
        {filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-subheading">No conversations yet.</li>
        )}
        {filtered.map((c) => {
          const carer = getCarer(c.carerId);
          if (!carer) return null;
          return (
            <li key={c.id}>
              <Link
                href={`/m/chat/${c.id}`}
                className="flex items-center gap-3 px-5 py-3 active:bg-muted/60"
              >
                <Avatar src={carer.photo} size={48} name={carer.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[15px] font-semibold text-heading">{carer.name}</p>
                    <span className="shrink-0 text-xs text-subheading">{c.when}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <p className="truncate text-sm text-subheading">{c.lastMessage}</p>
                    {c.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
                        {c.unread}
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar, BottomNav, Avatar, IconSearch } from "../_components/ui";

/** Shape returned by GET /api/m/chat/threads (see list-handler.ts). */
type ThreadListItem = {
  id: string;
  booking_id: string;
  pinned: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  participant_count: number;
  viewer_role: "seeker" | "carer" | "family" | "admin";
  counterpart_name: string | null;
  counterpart_avatar_url: string | null;
};

/** Compact relative time for the row timestamp (e.g. "10:24", "Mon"). */
function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    return then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return then.toLocaleDateString([], { weekday: "short" });
  return then.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export default function ChatListPage() {
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/m/chat/threads", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<{ threads: ThreadListItem[] }>;
      })
      .then((json) => {
        if (!cancelled) setThreads(json.threads ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The endpoint already sorts (live before archived, pinned first,
  // recency within group); the client only filters by name.
  const filtered = threads.filter((t) =>
    (t.counterpart_name ?? "").toLowerCase().includes(q.toLowerCase()),
  );

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
        {loading && (
          <li className="px-5 py-10 text-center text-sm text-subheading">
            Loading conversations…
          </li>
        )}
        {!loading && error && (
          <li className="px-5 py-10 text-center text-sm text-subheading">
            Could not load conversations.
          </li>
        )}
        {!loading && !error && filtered.length === 0 && (
          <li className="px-5 py-10 text-center text-sm text-subheading">
            No conversations yet.
          </li>
        )}
        {!loading &&
          !error &&
          filtered.map((t) => {
            const name = t.counterpart_name ?? "Conversation";
            const archived = t.archived_at !== null;
            return (
              <li key={t.id}>
                <Link
                  href={`/m/chat/${t.id}`}
                  className={`flex items-center gap-3 px-5 py-3 active:bg-muted/60 ${
                    archived ? "opacity-60" : ""
                  }`}
                >
                  <Avatar
                    src={t.counterpart_avatar_url ?? undefined}
                    size={48}
                    name={name}
                  />
                  <div
                    className="min-w-0 flex-1"
                    style={{
                      fontFamily:
                        "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* P1-B9.4: pinned-thread glyph. Filled teal so it
                            tracks the brand and matches the in-thread
                            button's active state. */}
                        {t.pinned && (
                          <ChatPinGlyph aria-label="Pinned conversation" />
                        )}
                        <p className="truncate text-[15px] font-semibold text-heading">
                          {name}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-subheading">
                        {archived ? "Archived" : formatWhen(t.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3">
                      <p className="truncate text-sm text-subheading">
                        {t.last_message_preview ?? "No messages yet"}
                      </p>
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

/**
 * P1-B9.4: small pinned-thread glyph rendered next to the carer name
 * in the thread list. Filled teal to match the brand and the active
 * state of the in-thread pin toggle.
 */
function ChatPinGlyph(props: { "aria-label"?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="#039EA0"
      stroke="#039EA0"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={props["aria-label"]}
      role={props["aria-label"] ? "img" : undefined}
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l3 4.24H6l3-4.24z" />
    </svg>
  );
}

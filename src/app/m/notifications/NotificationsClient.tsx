"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BottomNav,
  Card,
  IconBell,
  IconChatBubble,
  IconCheck,
  TopBar,
} from "../_components/ui";
import {
  setUnreadCount,
  decrementUnreadCount,
} from "@/lib/notifications/useUnreadNotifications";
import type {
  ApiNotification,
  ApiNotificationsListResponse,
} from "@/lib/notifications/types";

/**
 * Notifications inbox — client shell.
 *
 * UX choices preserved from v1:
 *   - Unread rows have a subtle teal left border + bolder copy.
 *   - "Mark all read" lives in the header right slot, mirrors iOS Mail.
 *   - Tapping a row deep-links to the relevant booking / chat / page;
 *     rows without a deeplink (system messages) are non-interactive.
 *   - Empty state is a friendly message, not a blank screen — important
 *     because new accounts hit this often.
 *
 * Live updates: subscribed to the per-user Supabase channel so new
 * notifications appear without a refresh.
 */
export default function NotificationsClient({
  userId,
  initial,
}: {
  userId: string;
  initial: ApiNotificationsListResponse;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ApiNotification[]>(initial.items);
  const unreadCount = useMemo(
    () => items.filter((n) => n.read_at === null).length,
    [items],
  );

  // Keep the global bell badge in sync with the server-rendered count
  // on first paint, before any realtime event fires.
  useEffect(() => {
    setUnreadCount(initial.unread_count);
  }, [initial.unread_count]);

  // Realtime — listen for inserts (new notifications) and updates
  // (reads from another tab) on the caller's rows only.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:user_id=eq.${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as ApiNotification;
          setItems((prev) =>
            prev.some((n) => n.id === row.id) ? prev : [row, ...prev],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as ApiNotification;
          setItems((prev) =>
            prev.map((n) => (n.id === row.id ? { ...n, ...row } : n)),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || target.read_at !== null) return prev;
      decrementUnreadCount();
      return prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
      );
    });
    // Fire-and-forget; the realtime UPDATE will reconcile if it fails.
    await fetch(`/api/m/notifications/${id}/mark-read`, { method: "POST" });
  }, []);

  const handleTap = useCallback(
    async (n: ApiNotification) => {
      const wasUnread = n.read_at === null;
      const promise = wasUnread ? markRead(n.id) : Promise.resolve();
      if (n.deeplink) {
        // Don't block navigation on the mark-read round-trip; it's
        // optimistic locally and the API call is idempotent.
        void promise;
        router.push(n.deeplink);
      } else {
        await promise;
      }
    },
    [markRead, router],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (n.read_at === null ? { ...n, read_at: now } : n)),
    );
    setUnreadCount(0);
    await fetch("/api/m/notifications/mark-all-read", { method: "POST" });
  }, []);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar
        back="/m/home"
        title="Notifications"
        right={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              className="text-[13px] font-bold text-primary px-2 py-1 sc-no-select"
              aria-label="Mark all as read"
            >
              Mark all read
            </button>
          ) : null
        }
      />

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="px-4 pt-3 space-y-3">
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onTap={handleTap} />
          ))}
        </ul>
      )}

      <BottomNav active="home" role="seeker" />
    </main>
  );
}

function NotificationRow({
  notification,
  onTap,
}: {
  notification: ApiNotification;
  onTap: (n: ApiNotification) => void;
}) {
  const { type, title, body, deeplink, read_at, created_at } = notification;
  const icon = iconFor(type);
  const isRead = read_at !== null;
  const when = formatRelative(created_at);

  const inner = (
    <Card className={`relative ${!isRead ? "border-l-4 border-l-primary" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="shrink-0 w-10 h-10 rounded-full grid place-items-center"
          style={{ background: "rgba(3,158,160,0.1)", color: "#039EA0" }}
        >
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-[14px] leading-snug ${
                isRead ? "text-heading font-semibold" : "text-heading font-bold"
              }`}
            >
              {title}
            </p>
            {!isRead && (
              <span
                className="shrink-0 mt-1 inline-block w-2 h-2 rounded-full bg-primary"
                aria-label="Unread"
              />
            )}
          </div>
          <p className="mt-1 text-[13px] text-subheading leading-relaxed">
            {body}
          </p>
          <p className="mt-1.5 text-[11px] text-subheading">{when}</p>
        </div>
      </div>
    </Card>
  );

  if (deeplink) {
    return (
      <li>
        <Link
          href={deeplink}
          onClick={(e) => {
            // Let the router handle nav, but also fire the mark-read.
            // Preventing default to keep behaviour identical to v1.
            e.preventDefault();
            onTap(notification);
          }}
          className="block sc-no-select active:opacity-80 transition-opacity"
        >
          {inner}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => onTap(notification)}
        className="w-full text-left sc-no-select active:opacity-80 transition-opacity"
      >
        {inner}
      </button>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="px-6 pt-20 text-center">
      <div
        className="mx-auto w-16 h-16 rounded-full grid place-items-center"
        style={{ background: "rgba(3,158,160,0.1)", color: "#039EA0" }}
        aria-hidden
      >
        <IconBell />
      </div>
      <h2 className="mt-4 text-[18px] font-bold text-heading">
        You&apos;re all caught up
      </h2>
      <p className="mt-2 text-[13px] text-subheading leading-relaxed">
        New booking updates and messages from your carers will show up here.
      </p>
    </div>
  );
}

/**
 * Map the dispatcher `type` strings to the existing icon set. Falls
 * back to the bell so a new event type added in PR-A2 still renders.
 */
function iconFor(type: string) {
  if (type.startsWith("message.")) return <IconChatBubble />;
  if (
    type === "booking.confirmed" ||
    type === "shift.arrived" ||
    type === "shift.completed" ||
    type === "review.received"
  ) {
    return <IconCheck />;
  }
  return <IconBell />;
}

/**
 * Relative-time formatter — terse, UK English. Matches v1's "10 min
 * ago" / "1 hr ago" / "Yesterday" cadence so the visual rhythm of the
 * list stays the same after the data swap.
 */
function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "Just now";
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

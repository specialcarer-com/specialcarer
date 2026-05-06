"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BottomNav,
  Card,
  IconBell,
  IconChatBubble,
  IconCheck,
  TopBar,
} from "../_components/ui";
import { NOTIFICATIONS, type AppNotification } from "../_lib/mock";

/**
 * Notifications inbox \u2014 the destination of the bell in TopBar.
 *
 * v1 reads from a static mock; the real version will subscribe to a
 * Supabase `notifications` table filtered by user_id and update
 * `read_at` when a row is tapped. The UX choice we're committing to:
 *
 *   - Unread rows have a subtle teal left border + bolder copy.
 *   - "Mark all read" lives in the header right slot, mirrors iOS Mail.
 *   - Tapping a row deep-links to the relevant booking / chat / page;
 *     rows without a deeplink (system messages) are non-interactive.
 *   - Empty state is a friendly message, not a blank screen \u2014 important
 *     because new accounts hit this often.
 */

export default function NotificationsPage() {
  // Local-state copy so "Mark all read" works without a backend call.
  // When real data lands, swap to a Supabase subscription + RPC.
  const [items, setItems] = useState<AppNotification[]>(NOTIFICATIONS);
  const unreadCount = items.filter((n) => !n.read).length;

  const markRead = (id: string) =>
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );

  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));

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
            <NotificationRow key={n.id} notification={n} onTap={markRead} />
          ))}
        </ul>
      )}

      <BottomNav active="home" role="seeker" />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Row
   ────────────────────────────────────────────────────────────────── */

function NotificationRow({
  notification,
  onTap,
}: {
  notification: AppNotification;
  onTap: (id: string) => void;
}) {
  const { id, kind, title, body, when, href, read } = notification;
  const icon = iconFor(kind);

  // Card body \u2014 shared between the linked + non-linked variants so the
  // visuals stay identical regardless of whether there's a deeplink.
  const inner = (
    <Card
      className={`relative ${
        !read ? "border-l-4 border-l-primary" : ""
      }`}
    >
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
                read ? "text-heading font-semibold" : "text-heading font-bold"
              }`}
            >
              {title}
            </p>
            {!read && (
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

  if (href) {
    return (
      <li>
        <Link
          href={href}
          onClick={() => onTap(id)}
          className="block sc-no-select active:opacity-80 transition-opacity"
        >
          {inner}
        </Link>
      </li>
    );
  }

  // System messages with no deeplink \u2014 tap still marks them read.
  return (
    <li>
      <button
        onClick={() => onTap(id)}
        className="w-full text-left sc-no-select active:opacity-80 transition-opacity"
      >
        {inner}
      </button>
    </li>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Empty state
   ────────────────────────────────────────────────────────────────── */

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

/* ──────────────────────────────────────────────────────────────────
   Icon mapping \u2014 keeps row visually scannable. We deliberately reuse
   icons that already exist in ui.tsx so the bundle doesn't bloat.
   ────────────────────────────────────────────────────────────────── */

function iconFor(kind: AppNotification["kind"]) {
  switch (kind) {
    case "message":
      return <IconChatBubble />;
    case "booking_accepted":
    case "booking_completed":
      return <IconCheck />;
    case "booking_requested":
    case "system":
    default:
      return <IconBell />;
  }
}

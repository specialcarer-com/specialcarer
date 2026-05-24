"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Module-level cache so every <NotificationBell /> instance shares one
 * source of truth. Multiple bells render across home / bookings / carer
 * pages; without a singleton each would issue its own /list fetch and
 * realtime subscription.
 */
type Listener = (count: number) => void;
let cachedCount: number | null = null;
let cachedUserId: string | null = null;
const listeners = new Set<Listener>();
let initInflight: Promise<void> | null = null;
let realtimeBound = false;

function notify(count: number) {
  cachedCount = count;
  for (const l of listeners) l(count);
}

async function fetchInitial(): Promise<void> {
  try {
    const res = await fetch("/api/m/notifications/list?limit=1", {
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { unread_count?: number };
    if (typeof json.unread_count === "number") {
      notify(json.unread_count);
    }
  } catch {
    /* best-effort: bell will hydrate on next mount or realtime event */
  }
}

function bindRealtime(userId: string) {
  if (realtimeBound && cachedUserId === userId) return;
  realtimeBound = true;
  cachedUserId = userId;
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
      () => {
        notify((cachedCount ?? 0) + 1);
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
      () => {
        // A row was likely marked read — recount authoritatively.
        void fetchInitial();
      },
    )
    .subscribe();
  // The channel intentionally lives for the page's lifetime; Next.js
  // soft-navigations keep the singleton, and a hard nav tears it down
  // with the page. No explicit teardown needed here.
  void channel;
}

/**
 * Returns the current unread-notifications count for the signed-in
 * user. Hydrates from /api/m/notifications/list, then keeps in sync
 * via Supabase realtime. Safe to call from multiple components.
 */
export function useUnreadNotifications(): number {
  const [count, setCount] = useState<number>(cachedCount ?? 0);

  useEffect(() => {
    listeners.add(setCount);
    if (cachedCount !== null) setCount(cachedCount);

    if (!initInflight) {
      initInflight = (async () => {
        await fetchInitial();
        try {
          const supabase = createClient();
          const { data } = await supabase.auth.getUser();
          if (data.user) bindRealtime(data.user.id);
        } catch {
          /* unauth — leave count at 0 */
        }
      })();
    }

    return () => {
      listeners.delete(setCount);
    };
  }, []);

  return count;
}

/**
 * Imperative setter for code paths that already know the new count
 * (e.g. mark-all-read). Avoids waiting for the realtime UPDATE round-trip.
 */
export function setUnreadCount(count: number) {
  notify(count);
}

export function decrementUnreadCount() {
  notify(Math.max(0, (cachedCount ?? 0) - 1));
}

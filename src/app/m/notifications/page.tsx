import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsClient from "./NotificationsClient";
import {
  listNotifications,
  type ListQueryClient,
} from "@/lib/notifications/list-handler";
import type {
  ApiNotificationsListResponse,
  NotificationRow,
} from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

/**
 * Notifications inbox — the destination of the bell in TopBar.
 *
 * v2 reads from the `notifications` table (RLS-scoped to the caller).
 * The layout below is unchanged from v1 — that visual treatment is
 * intentional and documented inline in NotificationsClient.
 */
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/m");
  }

  const client: ListQueryClient = {
    async fetchPage({ limit }) {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, type, title, body, deeplink, payload, read_at, created_at",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) return { rows: [], error: error.message };
      return { rows: (data ?? []) as NotificationRow[], error: null };
    },
    async fetchUnreadCount() {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (error) return { count: 0, error: error.message };
      return { count: count ?? 0, error: null };
    },
  };

  const result = await listNotifications(client, {});
  const initial: ApiNotificationsListResponse = result.ok
    ? result.data
    : { items: [], next_cursor: null, unread_count: 0 };

  return <NotificationsClient userId={user.id} initial={initial} />;
}

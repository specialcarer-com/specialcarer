import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listNotifications,
  type ListQueryClient,
} from "@/lib/notifications/list-handler";
import type { NotificationRow } from "@/lib/notifications/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/notifications/list?cursor=...&limit=20
 *
 * Keyset-paginated by (created_at desc, id desc). Returns the next
 * cursor when more rows remain, plus the user's unread count so the
 * bell badge can hydrate without a second request.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = url.searchParams.get("limit");

  const client: ListQueryClient = {
    async fetchPage({ limit: pageLimit, cursor: decoded }) {
      let q = supabase
        .from("notifications")
        .select(
          "id, type, title, body, deeplink, payload, read_at, created_at",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageLimit);
      if (decoded) {
        // Keyset: rows strictly older than the cursor row. Postgres
        // .or() supports tuple-style comparisons via paired filters.
        q = q.or(
          `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`,
        );
      }
      const { data, error } = await q;
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

  const result = await listNotifications(client, { cursor, limit });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

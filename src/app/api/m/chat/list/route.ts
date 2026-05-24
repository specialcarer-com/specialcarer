import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listThreads } from "@/lib/chat/server";
import type { ApiThreadListItem, ApiThreadPeer } from "@/lib/chat/client";

export const dynamic = "force-dynamic";

export type ApiChatListResponse = {
  items: ApiThreadListItem[];
  next_cursor: string | null;
};

/**
 * GET /api/m/chat/list?cursor=<iso>&limit=<int>
 *
 * Returns the caller's threads with participants + last-message preview
 * + per-thread unread count. Keyset paginated by last_message_at desc.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  const result = await listThreads(user.id, { cursor, limit });
  if (result.items.length === 0) {
    const empty: ApiChatListResponse = { items: [], next_cursor: null };
    return NextResponse.json(empty);
  }

  // Resolve a "peer" profile per thread: the other participant. For 1:1
  // booking threads this is unambiguous; group threads would need a
  // richer rollup which the UI doesn't surface yet.
  const peerIds = Array.from(
    new Set(
      result.items
        .map((t) => t.participants.find((p) => p.user_id !== user.id)?.user_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  type CarerProfile = {
    user_id: string;
    display_name: string | null;
    photo_url: string | null;
  };
  type Profile = {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };

  const admin = createAdminClient();
  let carerById = new Map<string, CarerProfile>();
  let profileById = new Map<string, Profile>();
  if (peerIds.length > 0) {
    const [{ data: carers }, { data: profs }] = await Promise.all([
      admin
        .from("caregiver_profiles")
        .select("user_id, display_name, photo_url")
        .in("user_id", peerIds),
      admin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", peerIds),
    ]);
    carerById = new Map(
      ((carers ?? []) as CarerProfile[]).map((c) => [c.user_id, c]),
    );
    profileById = new Map(
      ((profs ?? []) as Profile[]).map((p) => [p.id, p]),
    );
  }

  const items: ApiThreadListItem[] = result.items.map((t) => {
    const peer = t.participants.find((p) => p.user_id !== user.id) ?? null;
    let resolved: ApiThreadPeer | null = null;
    if (peer) {
      const carer = carerById.get(peer.user_id) ?? null;
      const prof = profileById.get(peer.user_id) ?? null;
      resolved = {
        user_id: peer.user_id,
        role: peer.role,
        display_name: carer?.display_name ?? prof?.full_name ?? null,
        photo_url: carer?.photo_url ?? prof?.avatar_url ?? null,
      };
    }
    return { ...t, peer: resolved };
  });

  const response: ApiChatListResponse = {
    items,
    next_cursor: result.next_cursor,
  };
  return NextResponse.json(response);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listMessages } from "@/lib/chat/server";
import type { ApiThreadPeer } from "@/lib/chat/client";
import type { Message, Participant } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

export type ApiChatMessagesResponse = {
  me: string;
  peer: ApiThreadPeer | null;
  last_message_at: string | null;
  unread_count: number;
  items: Message[];
  next_cursor: string | null;
};

/**
 * GET /api/m/chat/[thread_id]/messages?cursor=<iso>&limit=<int>
 *
 * Returns the caller's view of a thread: the peer participant's
 * profile snapshot (for the chat header), the message page, and a
 * cursor for the next page. Non-participants get 404.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ thread_id: string }> },
) {
  const { thread_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: parts } = await admin
    .from("chat_participants")
    .select("thread_id, user_id, role, joined_at, last_read_at")
    .eq("thread_id", thread_id);
  const participants = (parts ?? []) as Participant[];
  const me = participants.find((p) => p.user_id === user.id);
  if (!me) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: thread } = await admin
    .from("chat_threads")
    .select("last_message_at")
    .eq("id", thread_id)
    .maybeSingle<{ last_message_at: string | null }>();

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const result = await listMessages(thread_id, { cursor, limit });

  // Unread = peer-authored messages newer than my last_read_at.
  let unread = 0;
  {
    let q = admin
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread_id)
      .is("deleted_at", null)
      .neq("sender_id", user.id);
    if (me.last_read_at) q = q.gt("created_at", me.last_read_at);
    const { count } = await q;
    unread = count ?? 0;
  }

  const peer = participants.find((p) => p.user_id !== user.id) ?? null;
  let resolvedPeer: ApiThreadPeer | null = null;
  if (peer) {
    type CarerProfile = {
      display_name: string | null;
      photo_url: string | null;
    };
    type Profile = { full_name: string | null; avatar_url: string | null };
    const [{ data: carer }, { data: prof }] = await Promise.all([
      admin
        .from("caregiver_profiles")
        .select("display_name, photo_url")
        .eq("user_id", peer.user_id)
        .maybeSingle<CarerProfile>(),
      admin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", peer.user_id)
        .maybeSingle<Profile>(),
    ]);
    resolvedPeer = {
      user_id: peer.user_id,
      role: peer.role,
      display_name: carer?.display_name ?? prof?.full_name ?? null,
      photo_url: carer?.photo_url ?? prof?.avatar_url ?? null,
    };
  }

  const response: ApiChatMessagesResponse = {
    me: user.id,
    peer: resolvedPeer,
    last_message_at: thread?.last_message_at ?? null,
    unread_count: unread,
    items: result.items,
    next_cursor: result.next_cursor,
  };
  return NextResponse.json(response);
}

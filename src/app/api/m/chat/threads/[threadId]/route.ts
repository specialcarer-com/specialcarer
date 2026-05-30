/**
 * GET /api/m/chat/threads/[threadId]
 *
 * Thread detail header: the thread row, the caller's participant role,
 * the counterpart (other party) for the avatar/title, and a booking
 * summary. 403 if the caller is not an active participant. Replaces the
 * mock getChat() preview/carer lookup on the thread page.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleThreadDetail,
  type DetailClient,
  type DetailRole,
} from "@/lib/chat/detail-handler";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

function buildClient(admin: AdminClient): DetailClient {
  return {
    async myRole(threadId, userId) {
      const { data, error } = await admin
        .from("chat_participants")
        .select("role")
        .eq("thread_id", threadId)
        .eq("user_id", userId)
        .is("removed_at", null)
        .is("banned_at", null)
        .maybeSingle();
      if (error) return { role: null, error };
      const row = data as { role: DetailRole } | null;
      return { role: row?.role ?? null, error: null };
    },
    async thread(threadId) {
      const { data, error } = await admin
        .from("chat_threads")
        .select("id, booking_id, pinned, archived_at, archived_reason")
        .eq("id", threadId)
        .maybeSingle();
      return {
        data: (data ?? null) as {
          id: string;
          booking_id: string;
          pinned: boolean;
          archived_at: string | null;
          archived_reason: string | null;
        } | null,
        error,
      };
    },
    async counterpart(threadId, userId) {
      const parts = await admin
        .from("chat_participants")
        .select("user_id")
        .eq("thread_id", threadId)
        .neq("user_id", userId)
        .is("removed_at", null)
        .is("banned_at", null);
      if (parts.error) return { data: null, error: parts.error };
      const rows = (parts.data ?? []) as { user_id: string }[];
      if (rows.length === 0) return { data: null, error: null };
      const { data: prof } = await admin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", rows[0].user_id)
        .maybeSingle();
      const p = prof as { full_name: string | null; avatar_url: string | null } | null;
      return {
        data: {
          display_name: p?.full_name ?? null,
          avatar_url: p?.avatar_url ?? null,
        },
        error: null,
      };
    },
    async booking(bookingId) {
      const { data, error } = await admin
        .from("bookings")
        .select("service_type, starts_at, status")
        .eq("id", bookingId)
        .maybeSingle();
      return {
        data: (data ?? null) as {
          service_type: string | null;
          starts_at: string | null;
          status: string | null;
        } | null,
        error,
      };
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    return await handleThreadDetail({
      thread_id: threadId,
      user_id: user.id,
      client: buildClient(admin),
    });
  } catch (e) {
    console.error("[chat.thread.GET] failed", e);
    return NextResponse.json({ error: "chat_thread_failed" }, { status: 500 });
  }
}

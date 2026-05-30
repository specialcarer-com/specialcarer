/**
 * GET /api/m/chat/threads
 *
 * The caller's chat thread list, server-sorted (live before archived,
 * pinned first, most-recent-activity first) and shaped for the mobile
 * list page. Replaces the mock CHATS array + client-side sortPinnedFirst.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleListThreads,
  type ListClient,
  type ThreadListRole,
} from "@/lib/chat/list-handler";

export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

function buildClient(
  admin: AdminClient,
  supabase: Awaited<ReturnType<typeof createClient>>,
): ListClient {
  return {
    async myParticipantRows(userId) {
      // User-scoped client: RLS only exposes the caller's own
      // chat_participants rows, which is exactly the "threads I'm in"
      // set we want to anchor the rest of the assembly to.
      const { data, error } = await supabase
        .from("chat_participants")
        .select("thread_id, role, last_read_at")
        .eq("user_id", userId)
        .is("removed_at", null)
        .is("banned_at", null);
      return {
        data: (data ?? null) as
          | { thread_id: string; role: ThreadListRole; last_read_at: string | null }[]
          | null,
        error,
      };
    },
    async threadsByIds(threadIds) {
      const { data, error } = await admin
        .from("chat_threads")
        .select("id, booking_id, pinned, archived_at, archived_reason, created_at")
        .in("id", threadIds)
        .limit(100);
      return {
        data: (data ?? null) as
          | {
              id: string;
              booking_id: string;
              pinned: boolean;
              archived_at: string | null;
              archived_reason: string | null;
              created_at: string;
            }[]
          | null,
        error,
      };
    },
    async visibleMessages(threadIds) {
      const { data, error } = await admin
        .from("chat_messages")
        .select("thread_id, sender_id, body, created_at")
        .in("thread_id", threadIds)
        .in("kind", ["message", "system"]);
      return {
        data: (data ?? null) as
          | {
              thread_id: string;
              sender_id: string;
              body: string;
              created_at: string;
            }[]
          | null,
        error,
      };
    },
    async participantsForThreads(threadIds) {
      const parts = await admin
        .from("chat_participants")
        .select("thread_id, user_id, role, added_at")
        .in("thread_id", threadIds)
        .is("removed_at", null)
        .is("banned_at", null);
      if (parts.error) {
        return { data: null, error: parts.error };
      }
      const rows = (parts.data ?? []) as {
        thread_id: string;
        user_id: string;
        role: ThreadListRole;
        added_at: string;
      }[];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const byId = new Map<
        string,
        { full_name: string | null; avatar_url: string | null }
      >();
      if (userIds.length > 0) {
        const profs = await admin
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds);
        for (const p of (profs.data ?? []) as {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
        }[]) {
          byId.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
        }
      }
      return {
        data: rows.map((r) => {
          const prof = byId.get(r.user_id);
          return {
            thread_id: r.thread_id,
            user_id: r.user_id,
            role: r.role,
            display_name: prof?.full_name ?? null,
            avatar_url: prof?.avatar_url ?? null,
          };
        }),
        error: null,
      };
    },
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    return await handleListThreads({
      user_id: user.id,
      client: buildClient(admin, supabase),
    });
  } catch (e) {
    console.error("[chat.threads.GET] failed", e);
    return NextResponse.json({ error: "chat_threads_failed" }, { status: 500 });
  }
}

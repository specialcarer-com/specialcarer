import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/auth";
import {
  handleUnarchiveThread,
  type UnarchiveClient,
} from "@/lib/chat/unarchive-handler";
import type { PinnedThreadRow } from "@/lib/chat/pin-handler";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/chat/threads/[threadId]/unarchive
 *
 * Admin-only. Clears archived_at / archived_reason / archived_by so the
 * thread reopens for both participants. Service-role client because the
 * RLS policy on chat_threads is scoped to participants.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { threadId } = await params;
  const admin = createAdminClient();

  const client: UnarchiveClient = {
    async unarchiveThread(id) {
      const { data, error } = await admin
        .from("chat_threads")
        .update({
          archived_at: null,
          archived_reason: null,
          archived_by: null,
        })
        .eq("id", id)
        .select(
          "id, booking_id, pinned, archived_at, archived_reason, archived_by, created_at",
        )
        .maybeSingle<PinnedThreadRow>();
      return { data, error };
    },
  };

  return handleUnarchiveThread({ thread_id: threadId, client });
}

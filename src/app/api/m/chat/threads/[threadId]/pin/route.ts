import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isThreadParticipant } from "@/lib/chat/server";
import {
  handlePinThread,
  type PinClient,
  type PinnedThreadRow,
} from "@/lib/chat/pin-handler";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/m/chat/threads/[threadId]/pin
 *
 * Body: { pinned: boolean }. Returns the updated thread row. The
 * caller must be a participant of the thread; RLS on chat_threads
 * is the second line of defence.
 */
export async function PATCH(
  req: Request,
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

  const allowed = await isThreadParticipant(threadId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const client: PinClient = {
    async updatePinned(id, pinned) {
      const { data, error } = await supabase
        .from("chat_threads")
        .update({ pinned })
        .eq("id", id)
        .select(
          "id, booking_id, pinned, archived_at, archived_reason, archived_by, created_at",
        )
        .maybeSingle<PinnedThreadRow>();
      return { data, error };
    },
  };

  return handlePinThread({ thread_id: threadId, body, client });
}

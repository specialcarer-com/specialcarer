import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isThreadParticipant, markRead } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/threads/[threadId]/read
 * Bumps the caller's chat_participants.last_read_at to now().
 */
export async function POST(
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

  const allowed = await isThreadParticipant(threadId, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await markRead(threadId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[chat.read.POST] failed", e);
    return NextResponse.json({ error: "chat_mark_read_failed" }, { status: 500 });
  }
}

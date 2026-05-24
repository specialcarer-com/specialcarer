import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { markRead } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/[thread_id]/mark-read
 * Bumps the caller's last_read_at on this thread. Idempotent.
 */
export async function POST(
  _req: Request,
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
  await markRead(thread_id, user.id);
  return NextResponse.json({ ok: true });
}

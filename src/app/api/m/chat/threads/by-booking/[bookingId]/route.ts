import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateBookingThread,
  isThreadParticipant,
} from "@/lib/chat/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/chat/threads/by-booking/[bookingId]
 *
 * Ensure-thread-exists-then-return. Wraps getOrCreateBookingThread.
 *  - 401 if no auth
 *  - 409 {error: "chat_no_carer_yet"} when the booking has no carer
 *  - 403 if the caller isn't a participant (defense-in-depth on RLS)
 *  - 200 {thread} on success
 *
 * Note: the brief specifies `/api/m/chat/threads/[bookingId]` but Next.js
 * does not allow two different dynamic segment names (`[bookingId]` and
 * `[threadId]`) at the same path level, so the booking-keyed lookup
 * lives at `/by-booking/[bookingId]` instead.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let thread;
  try {
    thread = await getOrCreateBookingThread(bookingId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("chat_no_carer_yet")) {
      return NextResponse.json({ error: "chat_no_carer_yet" }, { status: 409 });
    }
    console.error("[chat.threads.by-booking] getOrCreate failed", e);
    return NextResponse.json({ error: "chat_thread_failed" }, { status: 500 });
  }

  const allowed = await isThreadParticipant(thread.id, user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ thread });
}

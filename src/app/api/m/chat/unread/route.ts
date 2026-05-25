import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnreadThreadIds } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/chat/unread   body: {bookingIds: string[]}
 *
 * Returns `{unreadBookingIds: string[]}` — the subset of the input that
 * currently has unread messages for the caller. Used by the
 * bookings/jobs list to render the per-row teal dot without N+1
 * round-trips.
 *
 * Body is small, capped to 100 ids to keep the in() filter bounded.
 */
const MAX_BOOKING_IDS = 100;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { bookingIds?: unknown };
  try {
    payload = (await req.json()) as { bookingIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = Array.isArray(payload.bookingIds) ? payload.bookingIds : [];
  const bookingIds = raw
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, MAX_BOOKING_IDS);

  if (bookingIds.length === 0) {
    return NextResponse.json({ unreadBookingIds: [] });
  }
  try {
    const set = await getUnreadThreadIds(user.id, bookingIds);
    return NextResponse.json({ unreadBookingIds: Array.from(set) });
  } catch (e) {
    console.error("[chat.unread.POST] failed", e);
    return NextResponse.json({ unreadBookingIds: [] });
  }
}

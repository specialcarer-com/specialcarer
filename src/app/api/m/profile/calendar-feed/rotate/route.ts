import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  feedUrlFor,
  generateCalendarToken,
} from "@/lib/calendar/handlers";
import { siteOrigin } from "@/lib/calendar/bookingEvent";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/profile/calendar-feed/rotate
 *
 * Generates a fresh per-user calendar feed token (also used for initial
 * "set up calendar sync"). Any previously issued URL stops working
 * immediately. Returns the new webcal:// subscribe URL.
 *
 * Auth: any signed-in user; writes only the caller's profile row.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = generateCalendarToken();
  const { error } = await supabase
    .from("profiles")
    .update({ calendar_token: token })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    token,
    url: feedUrlFor(siteOrigin(), token),
  });
}

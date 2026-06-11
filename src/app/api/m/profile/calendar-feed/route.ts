import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { feedUrlFor } from "@/lib/calendar/handlers";
import { siteOrigin } from "@/lib/calendar/bookingEvent";

export const dynamic = "force-dynamic";

export type CalendarFeedStatus = {
  enabled: boolean;
  url: string | null;
};

/**
 * GET /api/m/profile/calendar-feed
 *
 * Returns the caller's current calendar feed state so the settings screen
 * can render either the "set up" CTA or the existing-URL controls.
 * Auth: any signed-in user.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("calendar_token")
    .eq("id", user.id)
    .maybeSingle<{ calendar_token: string | null }>();

  const token = data?.calendar_token ?? null;
  const body: CalendarFeedStatus = {
    enabled: Boolean(token),
    url: token ? feedUrlFor(siteOrigin(), token) : null,
  };
  return NextResponse.json(body);
}

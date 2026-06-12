import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_EVENT_COLUMNS,
  type BookingEventRow,
} from "@/lib/calendar/bookingEvent";
import { buildFeedIcs, isValidCalendarToken } from "@/lib/calendar/handlers";

export const dynamic = "force-dynamic";

/** Upcoming-window for the feed: now → +90 days. */
const FEED_WINDOW_DAYS = 90;

/**
 * GET /api/calendar/feed/[token].ics
 *
 * Public, no-session route. Authenticated purely by the opaque per-user
 * `calendar_token` embedded in the URL (calendar clients can't carry the
 * session cookie). Returns the user's upcoming bookings as a PUBLISH feed
 * that the client re-fetches every few hours.
 *
 * Unknown / disabled / malformed token → 404 (don't reveal which).
 *
 * TODO(rate-limit): the repo has no shared rate-limit infra yet. This public
 * route should be capped per-token (e.g. 60 req/hour) once that lands; until
 * then the cost is bounded by the cheap indexed token lookup + 90-day query.
 */
export async function GET(req: Request) {
  // Next 15's typed-routes generator strips the literal ".ics" from the
  // `[token].ics` segment and emits an EMPTY params type for this route, so we
  // can't read the token from `params` without a build-time type error. Derive
  // it from the URL pathname instead (last path segment, sans ".ics").
  const { pathname } = new URL(req.url);
  const last = pathname.split("/").pop() ?? "";
  const token = decodeURIComponent(last).replace(/\.ics$/i, "");

  if (!isValidCalendarToken(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("calendar_token", token)
    .maybeSingle<{ id: string }>();

  if (!profile) {
    return new NextResponse("Not found", { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const horizon = new Date(
    Date.now() + FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows } = await admin
    .from("bookings")
    .select(BOOKING_EVENT_COLUMNS)
    .or(`seeker_id.eq.${profile.id},caregiver_id.eq.${profile.id}`)
    .gte("starts_at", nowIso)
    .lte("starts_at", horizon)
    .order("starts_at", { ascending: true })
    .returns<BookingEventRow[]>();

  const body = buildFeedIcs(rows ?? []);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // Subscriptions are polled; allow a short shared cache to soak bursts.
      "Cache-Control": "public, max-age=900",
    },
  });
}

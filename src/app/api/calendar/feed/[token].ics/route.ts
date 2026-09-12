import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_EVENT_COLUMNS,
  type BookingEventRow,
} from "@/lib/calendar/bookingEvent";
import { buildFeedIcs, isValidCalendarToken } from "@/lib/calendar/handlers";
import { getRequestIp } from "@/lib/rate-limit";
import { check as rlCheck } from "@/lib/rate-limit/distributed";
import { rateLimitHeaders } from "@/lib/rate-limit/headers";
import { calendarFeedIp, calendarFeedToken } from "@/lib/rate-limit/keys";

export const dynamic = "force-dynamic";

/** Upcoming-window for the feed: now → +90 days. */
const FEED_WINDOW_DAYS = 90;

/** Authorised token: 60 pulls/hour (calendar clients poll every few hours). */
const KNOWN_TOKEN_LIMIT = 60;
/** Unknown token per IP: 6/hour — leak-safe 404 stops token enumeration. */
const UNKNOWN_TOKEN_IP_LIMIT = 6;
const HOUR_SEC = 60 * 60;

/** Uniform 404 body used for both malformed tokens AND rate-limited unknown
 *  tokens so an attacker can't distinguish "invalid shape" from "guessed too
 *  many times" from "real token that's disabled". */
function leakSafeNotFound(
  extraHeaders?: Record<string, string>,
): NextResponse {
  return new NextResponse("Not found", {
    status: 404,
    headers: extraHeaders,
  });
}

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
 * Rate-limited (PR C2, Phase C):
 *   - 60 req/hour per authorised token (calendar clients poll every few hours)
 *   - 6 req/hour per source IP for UNKNOWN tokens, with 404 leak-safe body
 *     (blocks token enumeration without revealing that limiting is active)
 */
export async function GET(req: Request) {
  // Next 15's typed-routes generator strips the literal ".ics" from the
  // `[token].ics` segment and emits an EMPTY params type for this route, so we
  // can't read the token from `params` without a build-time type error. Derive
  // it from the URL pathname instead (last path segment, sans ".ics").
  const { pathname } = new URL(req.url);
  const last = pathname.split("/").pop() ?? "";
  const token = decodeURIComponent(last).replace(/\.ics$/i, "");

  // Anti-enumeration: cap unknown/invalid-token traffic per IP FIRST, so a
  // brute-force scan can't churn our profile lookup 100 req/s.
  if (!isValidCalendarToken(token)) {
    const ip = getRequestIp(req);
    const ipCheck = await rlCheck({
      key: calendarFeedIp(ip),
      limit: UNKNOWN_TOKEN_IP_LIMIT,
      windowSec: HOUR_SEC,
    });
    // Same 404 body in both branches — never reveal that limiting is happening.
    return leakSafeNotFound(rateLimitHeaders(ipCheck));
  }

  // Valid-shape token: apply the per-token bucket BEFORE hitting Supabase so
  // a stolen token can't burn our DB budget either.
  const tokenCheck = await rlCheck({
    key: calendarFeedToken(token),
    limit: KNOWN_TOKEN_LIMIT,
    windowSec: HOUR_SEC,
  });
  if (!tokenCheck.ok) {
    return new NextResponse("Rate limited", {
      status: 429,
      headers: rateLimitHeaders(tokenCheck),
    });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("calendar_token", token)
    .maybeSingle<{ id: string }>();

  if (!profile) {
    // Valid shape but no owner — treat as unknown-token for the anti-enumeration
    // budget (same 404 body as above so the two paths are indistinguishable).
    const ip = getRequestIp(req);
    const ipCheck = await rlCheck({
      key: calendarFeedIp(ip),
      limit: UNKNOWN_TOKEN_IP_LIMIT,
      windowSec: HOUR_SEC,
    });
    return leakSafeNotFound(rateLimitHeaders(ipCheck));
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
      ...rateLimitHeaders(tokenCheck),
    },
  });
}

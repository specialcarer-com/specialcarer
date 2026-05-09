import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_MODEL_VERSION,
  type AnomalyKind,
  type AnomalySeverity,
} from "./types";

/**
 * Anomaly rule set v1. Insert into ai_anomaly_signals with dedup by
 * (booking_id, kind) within the last 24h.
 *
 * Notes
 *  - The brief mentioned a `confirmed` booking status; the canonical
 *    enum is pending|accepted|paid|in_progress|completed|paid_out|
 *    cancelled|refunded|disputed. We use `paid` and `in_progress` as
 *    the active set and `completed`/`cancelled` as the terminal set.
 *  - route_deviation is intentionally not implemented (TODO PostGIS).
 */

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

type Booking = {
  id: string;
  caregiver_id: string | null;
  seeker_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  actual_started_at: string | null;
  checked_out_at: string | null;
  shift_completed_at: string | null;
  cancelled_at: string | null;
  updated_at?: string | null;
};

type Inserted = {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  magnitude: number | null;
  details: Record<string, unknown>;
  caregiver_id: string | null;
  seeker_id: string | null;
};

async function alreadyExists(
  bookingId: string,
  kind: AnomalyKind,
): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("ai_anomaly_signals")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("kind", kind)
    .gte("detected_at", since);
  return (count ?? 0) > 0;
}

async function insertSignal(
  bookingId: string | null,
  s: Inserted,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_anomaly_signals").insert({
    booking_id: bookingId,
    caregiver_id: s.caregiver_id,
    seeker_id: s.seeker_id,
    kind: s.kind,
    severity: s.severity,
    magnitude: s.magnitude,
    details: s.details,
    status: "open",
    model_version: AI_MODEL_VERSION,
  });
  if (error) {
    console.error("ai_anomaly_signals insert failed", error);
  }
}

/**
 * Run the booking-scoped rules for a single booking.
 */
export async function detectForBooking(
  bookingId: string,
): Promise<Inserted[]> {
  const admin = createAdminClient();
  const { data: bRow } = await admin
    .from("bookings")
    .select(
      "id, caregiver_id, seeker_id, starts_at, ends_at, status, actual_started_at, checked_out_at, shift_completed_at, cancelled_at",
    )
    .eq("id", bookingId)
    .maybeSingle<Booking>();
  if (!bRow) return [];
  const b = bRow;
  const inserts: Inserted[] = [];

  // ── no_show: cancelled AND never started AND now > starts_at + 30 min
  if (
    b.status === "cancelled" &&
    !b.actual_started_at &&
    b.starts_at &&
    Date.now() > new Date(b.starts_at).getTime() + 30 * 60_000
  ) {
    if (!(await alreadyExists(b.id, "no_show"))) {
      const sig: Inserted = {
        kind: "no_show",
        severity: "high",
        magnitude: null,
        details: { starts_at: b.starts_at, cancelled_at: b.cancelled_at },
        caregiver_id: b.caregiver_id,
        seeker_id: b.seeker_id,
      };
      inserts.push(sig);
      await insertSignal(b.id, sig);
    }
  }

  // ── late_check_in: actual_started_at − starts_at > 15 min
  if (b.starts_at && b.actual_started_at) {
    const lateMin =
      (new Date(b.actual_started_at).getTime() -
        new Date(b.starts_at).getTime()) /
      60_000;
    if (lateMin > 15) {
      const severity: AnomalySeverity =
        lateMin > 60 ? "high" : lateMin > 30 ? "medium" : "low";
      if (!(await alreadyExists(b.id, "late_check_in"))) {
        const sig: Inserted = {
          kind: "late_check_in",
          severity,
          magnitude: Math.round(lateMin),
          details: {
            starts_at: b.starts_at,
            actual_started_at: b.actual_started_at,
            minutes_late: Math.round(lateMin),
          },
          caregiver_id: b.caregiver_id,
          seeker_id: b.seeker_id,
        };
        inserts.push(sig);
        await insertSignal(b.id, sig);
      }
    }
  }

  // ── early_check_out: ends_at − checked_out_at > 30 min
  if (b.ends_at && b.checked_out_at) {
    const earlyMin =
      (new Date(b.ends_at).getTime() -
        new Date(b.checked_out_at).getTime()) /
      60_000;
    if (earlyMin > 30) {
      const severity: AnomalySeverity =
        earlyMin > 120 ? "high" : earlyMin > 60 ? "medium" : "low";
      if (!(await alreadyExists(b.id, "early_check_out"))) {
        const sig: Inserted = {
          kind: "early_check_out",
          severity,
          magnitude: Math.round(earlyMin),
          details: {
            ends_at: b.ends_at,
            checked_out_at: b.checked_out_at,
            minutes_early: Math.round(earlyMin),
          },
          caregiver_id: b.caregiver_id,
          seeker_id: b.seeker_id,
        };
        inserts.push(sig);
        await insertSignal(b.id, sig);
      }
    }
  }

  // ── route_deviation: NOT IMPLEMENTED — needs PostGIS distance.
  // TODO: implement geofence check from carer_positions vs booking
  // location. Leaving deliberately.

  // ── location_gap: status=in_progress AND last_ping_at older than 15 min
  if (b.status === "in_progress") {
    const { data: trk } = await admin
      .from("shift_tracking_sessions")
      .select("id, last_ping_at")
      .eq("booking_id", b.id)
      .maybeSingle<{ id: string; last_ping_at: string | null }>();
    if (trk?.last_ping_at) {
      const gapMin =
        (Date.now() - new Date(trk.last_ping_at).getTime()) / 60_000;
      if (gapMin > 15) {
        if (!(await alreadyExists(b.id, "location_gap"))) {
          const sig: Inserted = {
            kind: "location_gap",
            severity: "medium",
            magnitude: Math.round(gapMin),
            details: {
              last_ping_at: trk.last_ping_at,
              minutes_since_last_ping: Math.round(gapMin),
            },
            caregiver_id: b.caregiver_id,
            seeker_id: b.seeker_id,
          };
          inserts.push(sig);
          await insertSignal(b.id, sig);
        }
      }
    }
  }

  // ── rating_drop on the caregiver. Caregiver-scoped, no booking_id.
  if (b.caregiver_id) {
    await maybeFireRatingDrop(b.caregiver_id);
  }
  return inserts;
}

/**
 * Caregiver-scoped: last 5 reviews avg < 3.5 AND prior 5 avg ≥ 4.0.
 * Dedupes via 24h window (no booking_id tied).
 */
async function maybeFireRatingDrop(caregiverId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: reviews } = await admin
    .from("reviews")
    .select("id, rating, created_at")
    .eq("caregiver_id", caregiverId)
    .order("created_at", { ascending: false })
    .limit(10);
  const list = (reviews ?? []) as { id: string; rating: number }[];
  if (list.length < 10) return;
  const last5 = list.slice(0, 5).map((r) => Number(r.rating));
  const prior5 = list.slice(5, 10).map((r) => Number(r.rating));
  const lastAvg = last5.reduce((a, b) => a + b, 0) / 5;
  const priorAvg = prior5.reduce((a, b) => a + b, 0) / 5;
  if (lastAvg < 3.5 && priorAvg >= 4.0) {
    // Dedup window — same kind, same caregiver, last 24h.
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("ai_anomaly_signals")
      .select("id", { count: "exact", head: true })
      .eq("caregiver_id", caregiverId)
      .eq("kind", "rating_drop")
      .gte("detected_at", since);
    if ((count ?? 0) > 0) return;
    await admin.from("ai_anomaly_signals").insert({
      caregiver_id: caregiverId,
      booking_id: null,
      seeker_id: null,
      kind: "rating_drop",
      severity: "medium",
      magnitude: Number((priorAvg - lastAvg).toFixed(2)),
      details: {
        last_5_avg: Number(lastAvg.toFixed(2)),
        prior_5_avg: Number(priorAvg.toFixed(2)),
      },
      status: "open",
      model_version: AI_MODEL_VERSION,
    });
  }
}

/**
 * Sweep recent bookings (~6h window) and run rules on each.
 */
export async function sweepRecent(): Promise<{ scanned: number; fired: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("bookings")
    .select("id, status, updated_at")
    .in("status", ["paid", "in_progress", "completed", "cancelled"])
    .gte("updated_at", since)
    .limit(500);
  const list = (data ?? []) as { id: string }[];
  let fired = 0;
  for (const b of list) {
    const inserts = await detectForBooking(b.id);
    fired += inserts.length;
  }
  return { scanned: list.length, fired };
}

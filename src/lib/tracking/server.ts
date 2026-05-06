/**
 * Live Tracking server lib.
 *
 * - Carer pings: insert via the user-scoped client so RLS WITH CHECK
 *   enforces "I'm the caregiver and the booking is paid/in_progress."
 * - Seeker reads: select latest position via user client (RLS lets
 *   parties + active family members see it). Stale positions are
 *   filtered server-side.
 * - Eligibility: helper that returns who the caller is on the booking
 *   and whether tracking can run right now.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isValidCoord } from "@/lib/mapbox/server";
import {
  POSITION_STALE_AFTER_MS,
  type CarerPosition,
  type TrackingEligibility,
} from "./types";

export async function getTrackingEligibility(
  bookingId: string,
): Promise<TrackingEligibility> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { eligible: false, reason: "Not authenticated." };

  const { data: booking, error } = await client
    .from("bookings")
    .select("id, seeker_id, caregiver_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking) {
    return { eligible: false, reason: "Booking not found." };
  }

  // Family-member access path: if the caller isn't the seeker/carer but is
  // an active family member of the seeker, treat them as a "seeker"-side
  // viewer for permission purposes.
  let role: "seeker" | "caregiver" | "family" | null = null;
  if (booking.seeker_id === user.id) role = "seeker";
  else if (booking.caregiver_id === user.id) role = "caregiver";
  else {
    const { data: fam } = await client
      .from("family_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(50);
    if (fam?.length) {
      const familyIds = fam.map((f) => f.id);
      // Confirm one of those families belongs to the seeker.
      const { count } = await client
        .from("families")
        .select("id", { count: "exact", head: true })
        .eq("primary_user_id", booking.seeker_id)
        .in(
          "id",
          // any family the user is a member of
          (
            await client
              .from("family_members")
              .select("family_id")
              .in("id", familyIds)
          ).data?.map((r) => r.family_id) ?? [],
        );
      if ((count ?? 0) > 0) role = "family";
    }
  }

  if (!role) {
    return { eligible: false, reason: "Not part of this booking." };
  }

  const trackable = ["paid", "in_progress"].includes(booking.status);
  if (!trackable) {
    return {
      eligible: false,
      reason:
        booking.status === "completed" || booking.status === "paid_out"
          ? "This booking has finished."
          : booking.status === "cancelled" || booking.status === "refunded"
            ? "This booking was cancelled."
            : "Tracking starts once the booking is paid and the carer is on the way.",
    };
  }

  // Map family-side viewers to "seeker" for the public eligibility result.
  return {
    eligible: true,
    role: role === "caregiver" ? "caregiver" : "seeker",
    bookingStatus: booking.status,
  };
}

export type RecordPingInput = {
  bookingId: string;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  heading?: number | null;
  speedMps?: number | null;
};

export type RecordPingResult =
  | { ok: true }
  | { ok: false; error: string; status?: number };

/** Carer-side: insert a single position ping. RLS enforces ownership. */
export async function recordCarerPing(
  input: RecordPingInput,
): Promise<RecordPingResult> {
  if (!isValidCoord(input.lat, input.lng)) {
    return { ok: false, error: "Invalid coordinates.", status: 400 };
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated.", status: 401 };

  const { error } = await client.from("carer_positions").insert({
    booking_id: input.bookingId,
    carer_id: user.id,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracyM ?? null,
    heading: input.heading ?? null,
    speed_mps: input.speedMps ?? null,
  });
  if (error) {
    const isRls = error.message?.includes("row-level security");
    return {
      ok: false,
      error: isRls
        ? "You can't share location for this booking right now."
        : "Couldn't save location.",
      status: isRls ? 403 : 500,
    };
  }
  return { ok: true };
}

/** Seeker/family/carer read: latest non-stale position for a booking. */
export async function getLatestPosition(
  bookingId: string,
): Promise<CarerPosition | null> {
  const client = await createClient();
  const { data, error } = await client
    .from("carer_positions_latest")
    .select(
      "booking_id, carer_id, lat, lng, accuracy_m, heading, speed_mps, recorded_at",
    )
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !data) return null;

  const ageMs = Date.now() - new Date(data.recorded_at).getTime();
  if (ageMs > POSITION_STALE_AFTER_MS) return null;

  return {
    bookingId: data.booking_id,
    carerId: data.carer_id,
    lat: data.lat,
    lng: data.lng,
    accuracyM: data.accuracy_m,
    heading: data.heading,
    speedMps: data.speed_mps,
    recordedAt: data.recorded_at,
  };
}

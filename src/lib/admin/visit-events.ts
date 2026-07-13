import { createAdminClient } from "@/lib/supabase/admin";

export type PhotoVerificationStatus =
  | "pending"
  | "passed"
  | "failed"
  | "skipped"
  | "error";

export type GeofenceStatus =
  | "passed"
  | "failed"
  | "no_client_address"
  | "no_carer_location"
  | "override";

export type VisitEvent = {
  id: string;
  visit_id: string;
  carer_id: string;
  event_type: "clock_in" | "clock_out";
  event_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_metres: number | null;
  client_reported_at: string | null;
  server_recorded_at: string;
  notes: string | null;
  photo_url: string | null;
  photo_verification_status: PhotoVerificationStatus;
  photo_similarity_score: number | null;
  photo_verification_checked_at: string | null;
  geofence_status: GeofenceStatus | null;
  distance_from_client_metres: number | null;
  admin_override_by: string | null;
  admin_override_reason: string | null;
  admin_override_at: string | null;
  verified_by_admin_id: string | null;
};

const VISIT_PHOTO_BUCKET = "visit-photos";
const SIGNED_URL_TTL_SECONDS = 3600;

const COLS =
  "id, visit_id, carer_id, event_type, event_at, latitude, longitude, accuracy_metres, client_reported_at, server_recorded_at, notes, photo_url, photo_verification_status, photo_similarity_score, photo_verification_checked_at, geofence_status, distance_from_client_metres, admin_override_by, admin_override_reason, admin_override_at, verified_by_admin_id";

/** All clock events for a visit, oldest first. Admin/service-role read. */
export async function getVisitEventsForAdmin(
  visitId: string,
): Promise<VisitEvent[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("visit_events")
    .select(COLS)
    .eq("visit_id", visitId)
    .order("event_at", { ascending: true })
    .returns<VisitEvent[]>();
  // Never fail-open: a silent error would show an empty log to ops when events
  // actually exist. Surface it so the caller can render an error state.
  if (error) throw new Error(`visit_events read failed: ${error.message}`);
  return data ?? [];
}

export type VisitEventsView = {
  events: VisitEvent[];
  /** event id → short-lived signed URL for its photo (private bucket). */
  photoUrls: Record<string, string>;
  /** admin/profile id → display name, for override + manual-review attribution. */
  adminNames: Record<string, string>;
};

/**
 * Events plus the derived data the ops card needs: signed URLs for the private
 * visit photos and display names for the admins who overrode or reviewed.
 * Signed URLs are minted with the service-role client (admin surface only).
 */
export async function getVisitEventsView(
  visitId: string,
): Promise<VisitEventsView> {
  const admin = createAdminClient();
  const events = await getVisitEventsForAdmin(visitId);

  const photoUrls: Record<string, string> = {};
  await Promise.all(
    events
      .filter((e) => e.photo_url)
      .map(async (e) => {
        const { data, error } = await admin.storage
          .from(VISIT_PHOTO_BUCKET)
          .createSignedUrl(e.photo_url as string, SIGNED_URL_TTL_SECONDS);
        // A missing/failed signed URL just hides the thumbnail — never throw.
        if (!error && data?.signedUrl) photoUrls[e.id] = data.signedUrl;
      }),
  );

  const adminIds = Array.from(
    new Set(
      events
        .flatMap((e) => [e.admin_override_by, e.verified_by_admin_id])
        .filter((id): id is string => !!id),
    ),
  );
  const adminNames: Record<string, string> = {};
  if (adminIds.length > 0) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", adminIds)
      .returns<{ id: string; full_name: string | null }[]>();
    if (error) throw new Error(`admin profile read failed: ${error.message}`);
    for (const row of data ?? []) {
      adminNames[row.id] = row.full_name?.trim() || "Admin";
    }
  }

  return { events, photoUrls, adminNames };
}

/** Percentage string for a 0–1 similarity score, e.g. 0.7321 → "73%". */
export function fmtSimilarity(score: number | null): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  return `${Math.round(score * 100)}%`;
}

/** Duration from the earliest clock_in to the latest clock_out, in ms. */
export function durationMsFromEvents(events: VisitEvent[]): number | null {
  const firstIn = events
    .filter((e) => e.event_type === "clock_in")
    .map((e) => new Date(e.event_at).getTime())
    .sort((a, b) => a - b)[0];
  const lastOut = events
    .filter((e) => e.event_type === "clock_out")
    .map((e) => new Date(e.event_at).getTime())
    .sort((a, b) => b - a)[0];
  if (firstIn == null || lastOut == null || lastOut <= firstIn) return null;
  return lastOut - firstIn;
}

/** Human "1h 23m" / "23m" from a millisecond duration. */
export function fmtDurationMs(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Signed minutes between the scheduled start and the actual clock-in.
 * Positive = late, negative = early. Null when there is no clock-in.
 */
export function clockInDeltaMinutes(
  scheduledStartIso: string,
  events: VisitEvent[],
): number | null {
  const firstIn = events
    .filter((e) => e.event_type === "clock_in")
    .map((e) => new Date(e.event_at).getTime())
    .sort((a, b) => a - b)[0];
  if (firstIn == null) return null;
  const scheduled = new Date(scheduledStartIso).getTime();
  return Math.round((firstIn - scheduled) / 60_000);
}

/** "12 min late" / "5 min early" / "on time". */
export function fmtDelta(deltaMin: number): string {
  if (deltaMin === 0) return "on time";
  const abs = Math.abs(deltaMin);
  return deltaMin > 0 ? `${abs} min late` : `${abs} min early`;
}

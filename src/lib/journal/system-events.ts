/**
 * System-authored journal events. These are the auto-injected entries
 * the seeker sees in the activity feed: "Sarah arrived at 2:00 PM",
 * "Sarah signed off at 5:00 PM", "Photo updates enabled by family",
 * etc.
 *
 * Best-effort: writes via the admin client and never throws — the
 * caller (booking-transition route, photo-consent toggle, etc.) keeps
 * its primary effect even if the journal entry fails to land.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SystemEventKind =
  | "accepted"
  | "arrival"
  | "arrival_forced"
  | "departure"
  | "departure_forced"
  | "timesheet_submitted"
  | "photo_consent_on"
  | "photo_consent_off";

type RecordSystemEventInput = {
  bookingId: string;
  kind: SystemEventKind;
  /** Display name to use in the body (e.g. carer's first name). */
  actorName?: string | null;
  /** Override clock; defaults to "now". */
  time?: Date;
  /**
   * Author of the entry. care_journal_entries.author_id has a FK to
   * auth.users so this MUST be a real user id — for arrival/departure
   * events that's the carer's id; for photo-consent toggles it's the
   * seeker's id.
   */
  authorId: string;
  /**
   * Carer's typed reason when forcing check-in/out outside the geofence.
   * Appended to the body so the seeker sees it in the activity feed.
   */
  forceReason?: string | null;
};

function shortTime(d: Date): string {
  // Locale-free 24-hour HH:MM. Avoids server/client mismatches.
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

function compose(input: RecordSystemEventInput): string {
  const t = shortTime(input.time ?? new Date());
  const who = input.actorName?.trim() || "Carer";
  const reasonSuffix = input.forceReason?.trim()
    ? ` — reason: ${input.forceReason.trim().slice(0, 280)}`
    : "";
  switch (input.kind) {
    case "accepted":
      return `${who} accepted the booking at ${t}.`;
    case "arrival":
      return `${who} arrived at ${t}.`;
    case "arrival_forced":
      return `${who} manually checked in at ${t}${reasonSuffix}.`;
    case "departure":
      return `${who} signed off at ${t}.`;
    case "departure_forced":
      return `${who} manually signed off at ${t}${reasonSuffix}.`;
    case "timesheet_submitted":
      return `${who} submitted their timesheet at ${t}.`;
    case "photo_consent_on":
      return `Photo updates enabled by family at ${t}.`;
    case "photo_consent_off":
      return `Photo updates disabled by family at ${t}.`;
  }
}

/**
 * Insert a system-authored journal entry tagged kind='system'. Returns
 * the inserted id on success, or null when the insert failed (logged).
 *
 * Pass an admin Supabase client so the row goes in regardless of whose
 * auth context we're on — the route's normal RLS-enforced effects
 * already happened before we got here.
 */
export async function recordSystemEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  input: RecordSystemEventInput,
): Promise<{ id: string } | null> {
  const body = compose(input);
  const { data, error } = await admin
    .from("care_journal_entries")
    .insert({
      author_id: input.authorId,
      booking_id: input.bookingId,
      kind: "system",
      body,
      photos: [],
    })
    .select("id")
    .single();
  if (error) {
    console.error("[journal] system event insert failed", error);
    return null;
  }
  return data as { id: string };
}

/**
 * Idempotency helper for system events that should fire at most once
 * per booking + kind (e.g. "arrival"). Skips the insert if a matching
 * row already exists.
 */
export async function recordSystemEventOnce(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  input: RecordSystemEventInput,
): Promise<{ id: string; created: boolean } | null> {
  const { data: existing } = await admin
    .from("care_journal_entries")
    .select("id")
    .eq("booking_id", input.bookingId)
    .eq("kind", "system")
    .ilike("body", `%${kindNeedle(input.kind)}%`)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return { id: existing.id, created: false };
  const inserted = await recordSystemEvent(admin, input);
  return inserted ? { id: inserted.id, created: true } : null;
}

function kindNeedle(kind: SystemEventKind): string {
  switch (kind) {
    case "arrival":
      return "arrived at";
    case "arrival_forced":
      return "manually checked in at";
    case "departure":
      return "signed off at";
    case "departure_forced":
      return "manually signed off at";
    case "timesheet_submitted":
      return "submitted their timesheet";
    case "accepted":
      return "accepted the booking at";
    case "photo_consent_on":
      return "enabled by family";
    case "photo_consent_off":
      return "disabled by family";
  }
}

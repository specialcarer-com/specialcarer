/**
 * Timeline event ingestion (gap 41).
 *
 * These helpers are called from existing write paths (care-journal create,
 * booking lifecycle transitions). They are FIRE-AND-FORGET: every function
 * swallows its own errors and must never throw into — or fail — the parent
 * transaction. Idempotency is guaranteed by the
 * (source_table, source_id, event_type) unique index, so re-running a path is
 * a harmless no-op.
 *
 * After recording an event we kick off the notification fan-out (also
 * fire-and-forget) so family members + the seeker get a push.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TimelineEventType, TimelineEventPayload } from "./types";

type AdminClient = SupabaseClient;

/** Resolve the family that owns a seeker, creating one lazily if absent. */
async function resolveFamilyId(
  admin: AdminClient,
  seekerId: string,
): Promise<string | null> {
  const { data: existing } = await admin
    .from("families")
    .select("id")
    .eq("primary_user_id", seekerId)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return existing.id;

  // Lazily create — mirrors getMyFamilyOverview()'s behaviour so a seeker who
  // has never opened the Family page still gets a timeline. The DB trigger
  // auto-creates the primary family_members row.
  const { data: created, error } = await admin
    .from("families")
    .insert({ primary_user_id: seekerId })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) {
    console.error("[timeline.ingest] family resolve failed", error);
    return null;
  }
  return created.id;
}

type RecordEventArgs = {
  seekerId: string;
  eventType: TimelineEventType;
  sourceTable: string;
  sourceId: string;
  bookingId?: string | null;
  actorId?: string | null;
  payload?: TimelineEventPayload;
  occurredAt?: string;
};

/**
 * Core insert. Returns the event id (new or pre-existing), or null on failure.
 * Idempotent via the unique index — a duplicate insert is treated as success
 * and the existing row id is returned.
 */
async function recordEvent(
  admin: AdminClient,
  args: RecordEventArgs,
): Promise<string | null> {
  const familyId = await resolveFamilyId(admin, args.seekerId);
  if (!familyId) return null;

  const row = {
    family_id: familyId,
    seeker_id: args.seekerId,
    event_type: args.eventType,
    source_table: args.sourceTable,
    source_id: args.sourceId,
    booking_id: args.bookingId ?? null,
    actor_id: args.actorId ?? null,
    payload: args.payload ?? {},
    occurred_at: args.occurredAt ?? new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("timeline_events")
    .insert(row)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    // Unique-violation == already recorded. Fetch and return the existing id.
    if (error.code === "23505") {
      const { data: existing } = await admin
        .from("timeline_events")
        .select("id")
        .eq("source_table", args.sourceTable)
        .eq("source_id", args.sourceId)
        .eq("event_type", args.eventType)
        .maybeSingle<{ id: string }>();
      return existing?.id ?? null;
    }
    console.error("[timeline.ingest] insert failed", args.eventType, error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Record a `note.created` event for a care-journal entry. Resolves the owning
 * seeker from the entry's booking (seeker_id) or about_user_id. Skips system
 * entries (check-in/out etc.) — those surface via booking events instead.
 *
 * Fire-and-forget: never throws.
 */
export async function recordNoteEvent(input: {
  entryId: string;
  authorId: string;
  bookingId?: string | null;
  aboutUserId?: string | null;
  kind?: string | null;
  mood?: string | null;
  body: string;
  photoCount?: number;
  adminClient?: AdminClient;
}): Promise<void> {
  try {
    if (input.kind === "system") return;
    const admin = input.adminClient ?? createAdminClient();

    // Determine the seeker this note is about.
    let seekerId: string | null = input.aboutUserId ?? null;
    if (!seekerId && input.bookingId) {
      const { data: booking } = await admin
        .from("bookings")
        .select("seeker_id")
        .eq("id", input.bookingId)
        .maybeSingle<{ seeker_id: string }>();
      seekerId = booking?.seeker_id ?? null;
    }
    if (!seekerId) return; // private note with no seeker context — not shown.

    const eventId = await recordEvent(admin, {
      seekerId,
      eventType: "note.created",
      sourceTable: "care_journal_entries",
      sourceId: input.entryId,
      bookingId: input.bookingId ?? null,
      actorId: input.authorId,
      payload: {
        kind: input.kind ?? "note",
        mood: input.mood ?? null,
        excerpt: input.body.slice(0, 280),
        photo_count: input.photoCount ?? 0,
      },
    });

    if (eventId) {
      const { fanOutTimelineEvent } = await import("./fanout");
      await fanOutTimelineEvent(admin, eventId);
    }
  } catch (err) {
    console.error("[timeline.ingest] recordNoteEvent failed", err);
  }
}

const BOOKING_EVENT_TYPES: Record<string, TimelineEventType> = {
  confirmed: "booking.confirmed",
  started: "booking.started",
  completed: "booking.completed",
  cancelled: "booking.cancelled",
};

/**
 * Record a booking lifecycle event. `transition` is one of
 * confirmed | started | completed | cancelled.
 *
 * Fire-and-forget: never throws.
 */
export async function recordBookingEvent(input: {
  bookingId: string;
  transition: "confirmed" | "started" | "completed" | "cancelled";
  actorId?: string | null;
  actorName?: string | null;
  adminClient?: AdminClient;
}): Promise<void> {
  try {
    const eventType = BOOKING_EVENT_TYPES[input.transition];
    if (!eventType) return;
    const admin = input.adminClient ?? createAdminClient();

    const { data: booking } = await admin
      .from("bookings")
      .select("id, seeker_id, starts_at, ends_at")
      .eq("id", input.bookingId)
      .maybeSingle<{
        id: string;
        seeker_id: string;
        starts_at: string | null;
        ends_at: string | null;
      }>();
    if (!booking?.seeker_id) return;

    const eventId = await recordEvent(admin, {
      seekerId: booking.seeker_id,
      eventType,
      sourceTable: "bookings",
      sourceId: input.bookingId,
      bookingId: input.bookingId,
      actorId: input.actorId ?? null,
      payload: {
        actor_name: input.actorName ?? null,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
      },
    });

    if (eventId) {
      const { fanOutTimelineEvent } = await import("./fanout");
      await fanOutTimelineEvent(admin, eventId);
    }
  } catch (err) {
    console.error("[timeline.ingest] recordBookingEvent failed", err);
  }
}

/**
 * Timeline notification fan-out (gap 41).
 *
 * Given a timeline event (or a new comment), resolve the set of recipients and
 * dispatch ONE push per recipient via the existing DispatchEvent pipeline.
 *
 * Recipient rules:
 *   - New event  → the seeker + all active family members. Plus the carer on
 *     the event's booking (they have read access to their own bookings'
 *     events). The actor is always excluded — no self-notifications.
 *   - New comment → the seeker + the commenter's family circle, excluding the
 *     commenter. (Carers are not part of the comment circle.)
 *
 * The recipient maths is split into a pure helper (`computeRecipients`) so it
 * can be unit-tested without a database.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatch, type DispatchEvent } from "@/lib/push/notify";
import type { TimelineEventType } from "./types";
import {
  computeRecipients,
  eventTitleFor,
  type CircleMember,
} from "./fanout-logic";

export {
  computeRecipients,
  eventTitleFor,
  type CircleMember,
  type ComputeRecipientsInput,
} from "./fanout-logic";

type AdminClient = SupabaseClient;

async function loadFamilyMembers(
  admin: AdminClient,
  familyId: string,
): Promise<CircleMember[]> {
  const { data } = await admin
    .from("family_members")
    .select("user_id, status")
    .eq("family_id", familyId);
  return (data ?? []).map((m) => ({
    userId: (m as { user_id: string | null }).user_id,
    status: (m as { status: string }).status,
  }));
}

async function carerForBooking(
  admin: AdminClient,
  bookingId: string | null,
): Promise<string | null> {
  if (!bookingId) return null;
  const { data } = await admin
    .from("bookings")
    .select("caregiver_id")
    .eq("id", bookingId)
    .maybeSingle<{ caregiver_id: string | null }>();
  return data?.caregiver_id ?? null;
}

/** Dispatch a timeline.event_created push to every recipient of an event. */
export async function fanOutTimelineEvent(
  admin: AdminClient,
  eventId: string,
): Promise<void> {
  try {
    const { data: event } = await admin
      .from("timeline_events")
      .select(
        "id, family_id, seeker_id, event_type, booking_id, actor_id, payload",
      )
      .eq("id", eventId)
      .maybeSingle<{
        id: string;
        family_id: string;
        seeker_id: string;
        event_type: TimelineEventType;
        booking_id: string | null;
        actor_id: string | null;
        payload: { excerpt?: string | null; actor_name?: string | null };
      }>();
    if (!event) return;

    const [members, carerId] = await Promise.all([
      loadFamilyMembers(admin, event.family_id),
      carerForBooking(admin, event.booking_id),
    ]);

    const recipients = computeRecipients({
      seekerId: event.seeker_id,
      members,
      actorId: event.actor_id,
      carerId,
    });

    const title = eventTitleFor(event.event_type, event.payload ?? {});
    const actorName = event.payload?.actor_name ?? null;

    await Promise.all(
      recipients.map((recipientId) => {
        const ev: DispatchEvent = {
          type: "timeline.event_created",
          recipientId,
          eventId: event.id,
          actorName,
          eventTitle: title,
        };
        return dispatch(ev);
      }),
    );
  } catch (err) {
    console.error("[timeline.fanout] event fan-out failed", err);
  }
}

/** Dispatch a timeline.comment_created push to every recipient of a comment. */
export async function fanOutTimelineComment(
  admin: AdminClient,
  commentId: string,
): Promise<void> {
  try {
    const { data: comment } = await admin
      .from("timeline_comments")
      .select("id, event_id, author_id, body")
      .eq("id", commentId)
      .maybeSingle<{
        id: string;
        event_id: string;
        author_id: string;
        body: string;
      }>();
    if (!comment) return;

    const { data: event } = await admin
      .from("timeline_events")
      .select("id, family_id, seeker_id")
      .eq("id", comment.event_id)
      .maybeSingle<{ id: string; family_id: string; seeker_id: string }>();
    if (!event) return;

    const members = await loadFamilyMembers(admin, event.family_id);

    // Comments: seeker + family circle, exclude the commenter. No carer.
    const recipients = computeRecipients({
      seekerId: event.seeker_id,
      members,
      actorId: comment.author_id,
      carerId: null,
    });

    const actorName = await displayNameFor(admin, comment.author_id);

    await Promise.all(
      recipients.map((recipientId) => {
        const ev: DispatchEvent = {
          type: "timeline.comment_created",
          recipientId,
          eventId: event.id,
          actorName,
          commentPreview: comment.body,
        };
        return dispatch(ev);
      }),
    );
  } catch (err) {
    console.error("[timeline.fanout] comment fan-out failed", err);
  }
}

/** Best-effort display name lookup (caregiver profile → profiles full_name). */
async function displayNameFor(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const { data: carer } = await admin
    .from("caregiver_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle<{ display_name: string | null }>();
  if (carer?.display_name) return carer.display_name;
  const { data: prof } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle<{ full_name: string | null }>();
  return prof?.full_name ?? null;
}

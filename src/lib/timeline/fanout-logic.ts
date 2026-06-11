/**
 * Pure recipient/title maths for timeline fan-out (gap 41).
 *
 * Kept free of `server-only` and Supabase imports so it can be unit-tested in
 * the node test runner. `fanout.ts` (the server-only orchestrator) re-exports
 * these.
 */
import type { TimelineEventType } from "./types";

export type CircleMember = {
  /** auth user id; null for not-yet-accepted invites (skipped). */
  userId: string | null;
  status: string; // 'active' | 'invited' | 'removed'
};

export type ComputeRecipientsInput = {
  seekerId: string;
  /** Active + non-active members of the family (we filter inside). */
  members: CircleMember[];
  /** The user who caused the event/comment — always excluded. */
  actorId: string | null;
  /** Carer on the booking, if any (events only; null for comments). */
  carerId?: string | null;
};

/**
 * Pure recipient resolver. Returns a de-duplicated list of user ids to notify,
 * with the actor removed and only active family members included.
 */
export function computeRecipients(input: ComputeRecipientsInput): string[] {
  const set = new Set<string>();
  set.add(input.seekerId);
  for (const m of input.members) {
    if (m.status === "active" && m.userId) set.add(m.userId);
  }
  if (input.carerId) set.add(input.carerId);
  if (input.actorId) set.delete(input.actorId);
  return [...set];
}

/** Short human label for an event type, used as the push body. */
export function eventTitleFor(
  eventType: TimelineEventType,
  payload: { excerpt?: string | null; actor_name?: string | null },
): string {
  switch (eventType) {
    case "note.created":
      return payload.excerpt
        ? payload.excerpt.slice(0, 80)
        : "A new care note was added";
    case "booking.confirmed":
      return "A carer is confirmed for an upcoming visit";
    case "booking.started":
      return "A care visit has started";
    case "booking.completed":
      return "A care visit was completed";
    case "booking.cancelled":
      return "A care visit was cancelled";
  }
}

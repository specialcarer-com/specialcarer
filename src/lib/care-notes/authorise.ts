/**
 * Pure authorisation check for care-note summarisation (gap 29).
 *
 * A caller may summarise/read a note iff they can read the underlying note:
 * the author (the carer who wrote it), the family member it concerns
 * (about_user_id), or a party (seeker/caregiver) on the linked booking.
 * Mirrors the SELECT RLS policy on care_note_summaries / care_journal_entries.
 *
 * Kept pure (no DB) so the route's authorisation is unit-testable without
 * Supabase — the route resolves the rows and passes them in.
 */

export type NoteAuthContext = {
  userId: string;
  authorId: string;
  aboutUserId: string | null;
  /** Booking parties, when the note is linked to a booking; null otherwise. */
  booking: { seekerId: string | null; caregiverId: string | null } | null;
};

export function canReadNote(ctx: NoteAuthContext): boolean {
  if (ctx.userId === ctx.authorId) return true;
  if (ctx.aboutUserId && ctx.userId === ctx.aboutUserId) return true;
  if (
    ctx.booking &&
    (ctx.userId === ctx.booking.seekerId ||
      ctx.userId === ctx.booking.caregiverId)
  ) {
    return true;
  }
  return false;
}

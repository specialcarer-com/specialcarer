/**
 * POST /api/m/care-notes/[id]/summarise
 *
 * On-demand "Key points" summarisation of a care-journal note (gap 29).
 * Read-through cache (care_note_summaries): a hit returns immediately, a miss
 * calls gpt-4o-mini and persists the row. Returns null when the note is too
 * short to summarise (< 200 chars).
 *
 * Auth + visibility are enforced here (matching the translate route): the
 * caller must be able to read the note — the author (the carer who wrote it),
 * the family member it concerns, or a party on the linked booking. The note
 * lookup + cache insert use the admin client; the cache read uses the
 * user-scoped client so RLS applies.
 *
 * Rate limited to 30/min/user to bound LLM spend (same budget as chat
 * translation in PR #70).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { createSummaryStore } from "@/lib/care-notes/store";
import { summariseNote } from "@/lib/care-notes/summarise";
import { canReadNote } from "@/lib/care-notes/authorise";

export const dynamic = "force-dynamic";

type NoteRow = {
  id: string;
  author_id: string;
  about_user_id: string | null;
  booking_id: string | null;
  body: string;
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve the note (admin — we authorise explicitly below rather than via RLS).
  const admin = createAdminClient();
  const { data: note, error: noteErr } = await admin
    .from("care_journal_entries")
    .select("id, author_id, about_user_id, booking_id, body")
    .eq("id", id)
    .maybeSingle<NoteRow>();
  if (noteErr || !note) {
    return NextResponse.json({ error: "note_not_found" }, { status: 404 });
  }

  // Authorised iff the caller can read the note: author, the family member it
  // concerns, or a party on the linked booking.
  let booking: { seeker_id: string | null; caregiver_id: string | null } | null =
    null;
  if (note.booking_id) {
    const { data } = await admin
      .from("bookings")
      .select("seeker_id, caregiver_id")
      .eq("id", note.booking_id)
      .maybeSingle<{ seeker_id: string | null; caregiver_id: string | null }>();
    booking = data ?? null;
  }
  const allowed = canReadNote({
    userId: user.id,
    authorId: note.author_id,
    aboutUserId: note.about_user_id,
    booking: booking
      ? { seekerId: booking.seeker_id, caregiverId: booking.caregiver_id }
      : null,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Bound LLM spend: ~30 summarisations/minute/user.
  if (
    !rateLimit(`care-note-summarise:${user.id}`, {
      limit: 30,
      windowMs: 60_000,
    })
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const store = createSummaryStore(supabase, admin);

  let summary: Awaited<ReturnType<typeof summariseNote>>;
  try {
    summary = await summariseNote({
      noteId: note.id,
      noteText: note.body,
      store,
    });
  } catch (e) {
    console.error("[care-notes.summarise] provider failed", e);
    return NextResponse.json({ error: "summarise_failed" }, { status: 502 });
  }

  if (!summary) {
    // Note too short to summarise.
    return NextResponse.json({ summary: null, note_id: note.id });
  }

  return NextResponse.json({
    note_id: note.id,
    summary: summary.summary,
    model: summary.model,
    prompt_version: summary.prompt_version,
  });
}

/**
 * Server-side data layer for the care journal.
 *
 * All reads and writes go through the SSR Supabase client so RLS
 * is enforced. Photo URLs are minted as 1h signed URLs at fetch time
 * — clients never see raw object paths.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  JOURNAL_MAX_PHOTOS,
  JOURNAL_MAX_BODY,
  type JournalEntry,
  type JournalKind,
  type JournalMood,
  type JournalPhoto,
} from "./types";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h
const PHOTOS_BUCKET = "journal-photos";

type EntryRow = {
  id: string;
  author_id: string;
  booking_id: string | null;
  about_user_id: string | null;
  kind: JournalKind;
  mood: JournalMood | null;
  body: string;
  photos: string[]; // storage paths
  created_at: string;
  updated_at: string;
};

async function signPhotos(
  client: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<JournalPhoto[]> {
  if (!paths.length) return [];
  const { data, error } = await client.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return paths.map((p) => ({ path: p, url: "" }));
  return data.map((d, i) => ({
    path: paths[i],
    url: d.signedUrl ?? "",
  }));
}

async function hydrateEntries(
  client: Awaited<ReturnType<typeof createClient>>,
  rows: EntryRow[],
): Promise<JournalEntry[]> {
  // Batch sign all photo paths across all rows in one call.
  const allPaths = rows.flatMap((r) => r.photos);
  const signed = await signPhotos(client, allPaths);
  const byPath = new Map(signed.map((s) => [s.path, s]));

  return rows.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    booking_id: r.booking_id,
    about_user_id: r.about_user_id,
    kind: r.kind,
    mood: r.mood,
    body: r.body,
    photos: r.photos.map(
      (p) => byPath.get(p) ?? { path: p, url: "" },
    ),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

/** Fetch the most recent journal entries the current user can see. */
export async function listJournalEntries(opts?: {
  limit?: number;
  bookingId?: string;
}): Promise<JournalEntry[]> {
  const client = await createClient();
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

  let query = client
    .from("care_journal_entries")
    .select(
      "id, author_id, booking_id, about_user_id, kind, mood, body, photos, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.bookingId) {
    query = query.eq("booking_id", opts.bookingId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[journal] list error", error);
    return [];
  }
  return hydrateEntries(client, (data ?? []) as EntryRow[]);
}

export type CreateJournalEntryInput = {
  body: string;
  kind?: JournalKind;
  mood?: JournalMood | null;
  bookingId?: string | null;
  aboutUserId?: string | null;
  /** Storage object paths already uploaded by the client. */
  photoPaths?: string[];
};

export type CreateJournalEntryResult =
  | { ok: true; entryId: string }
  | { ok: false; error: string };

/**
 * Insert a new journal entry as the current user. Caller must already
 * be authenticated; we double-check via getUser() to surface a friendly
 * error rather than relying on RLS to fail.
 */
export async function createJournalEntry(
  input: CreateJournalEntryInput,
): Promise<CreateJournalEntryResult> {
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Please add a note before saving." };
  if (body.length > JOURNAL_MAX_BODY) {
    return {
      ok: false,
      error: `Notes are limited to ${JOURNAL_MAX_BODY} characters.`,
    };
  }
  const photos = (input.photoPaths ?? []).slice(0, JOURNAL_MAX_PHOTOS);

  const client = await createClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "You need to be signed in to add a note." };
  }

  const { data, error } = await client
    .from("care_journal_entries")
    .insert({
      author_id: user.id,
      booking_id: input.bookingId ?? null,
      about_user_id: input.aboutUserId ?? null,
      kind: input.kind ?? "note",
      mood: input.mood ?? null,
      body,
      photos,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[journal] insert error", error);
    return {
      ok: false,
      error:
        error?.message?.includes("violates row-level security")
          ? "You don't have permission to add a note to that booking."
          : "Sorry — we couldn't save your note. Please try again.",
    };
  }

  return { ok: true, entryId: data.id };
}

/** Delete an entry the current user authored within the 24h window. */
export async function deleteJournalEntry(
  entryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = await createClient();
  const { error } = await client
    .from("care_journal_entries")
    .delete()
    .eq("id", entryId);
  if (error) {
    return {
      ok: false,
      error:
        error.message?.includes("violates row-level security") ||
        error.message?.includes("permission denied")
          ? "This note can no longer be deleted."
          : "Couldn't delete the note.",
    };
  }
  return { ok: true };
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createJournalEntry,
  listJournalEntries,
} from "@/lib/journal/server";
import {
  JOURNAL_KINDS,
  JOURNAL_MOODS,
  JOURNAL_MAX_BODY,
  JOURNAL_MAX_PHOTOS,
} from "@/lib/journal/types";

export const dynamic = "force-dynamic";

/** GET /api/journal?bookingId=...  → list entries the user can read. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const entries = await listJournalEntries({
    bookingId,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json({ entries });
}

/** POST /api/journal  → create an entry as the current user. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const p = (payload ?? {}) as Record<string, unknown>;
  const body = typeof p.body === "string" ? p.body : "";
  const kindRaw = typeof p.kind === "string" ? p.kind : "note";
  const moodRaw = typeof p.mood === "string" ? p.mood : null;
  const bookingId =
    typeof p.bookingId === "string" && p.bookingId ? p.bookingId : null;
  const aboutUserId =
    typeof p.aboutUserId === "string" && p.aboutUserId
      ? p.aboutUserId
      : null;
  const photoPathsRaw = Array.isArray(p.photoPaths) ? p.photoPaths : [];

  if (
    !(JOURNAL_KINDS as readonly string[]).includes(kindRaw)
  ) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (
    moodRaw !== null &&
    !(JOURNAL_MOODS as readonly string[]).includes(moodRaw)
  ) {
    return NextResponse.json({ error: "Invalid mood" }, { status: 400 });
  }
  if (!body.trim()) {
    return NextResponse.json(
      { error: "Please add a note before saving." },
      { status: 400 },
    );
  }
  if (body.length > JOURNAL_MAX_BODY) {
    return NextResponse.json(
      { error: `Notes are limited to ${JOURNAL_MAX_BODY} characters.` },
      { status: 400 },
    );
  }

  const photoPaths: string[] = [];
  for (const v of photoPathsRaw) {
    if (typeof v !== "string") continue;
    if (!v.startsWith(`${user.id}/`)) continue; // belt-and-braces ownership
    photoPaths.push(v);
    if (photoPaths.length >= JOURNAL_MAX_PHOTOS) break;
  }

  const result = await createJournalEntry({
    body,
    kind: kindRaw as (typeof JOURNAL_KINDS)[number],
    mood: moodRaw as (typeof JOURNAL_MOODS)[number] | null,
    bookingId,
    aboutUserId,
    photoPaths,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ entryId: result.entryId });
}

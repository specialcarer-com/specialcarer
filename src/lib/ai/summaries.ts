import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_MODEL_VERSION,
  type CareSummary,
  type CareSummaryScope,
  type MoodTrend,
} from "./types";

/**
 * Heuristic care-summary v1. No external LLM. Summarises a booking or
 * a recipient time window from care_journal_entries.
 *
 * Notes
 *  - care_journal_entries.kind enum: note|meal|medication|activity|mood|incident
 *  - care_journal_entries.mood enum: calm|engaged|tired|unsettled|distressed
 *    Mapping: calm/engaged → positive; tired → neutral; unsettled/distressed → concern.
 */

type JournalEntry = {
  id: string;
  author_id: string | null;
  booking_id: string | null;
  about_user_id: string | null;
  kind: string;
  mood: string | null;
  body: string | null;
  created_at: string;
};

const MAX_HEADLINE_CHARS = 120;
const MAX_BULLETS = 6;

const POSITIVE_MOODS = new Set(["calm", "engaged"]);
const CONCERN_MOODS = new Set(["unsettled", "distressed"]);

function firstSentence(text: string | null | undefined, max = 200): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  const m = t.match(/[^.!?]+[.!?]?/);
  const sentence = (m ? m[0] : t).trim();
  return sentence.length > max ? sentence.slice(0, max - 1) + "…" : sentence;
}

function aggregateMood(entries: JournalEntry[]): MoodTrend {
  const moodEntries = entries.filter((e) => e.mood);
  if (moodEntries.length === 0) return "neutral";
  let pos = 0;
  let conc = 0;
  for (const e of moodEntries) {
    const m = (e.mood ?? "").toLowerCase();
    if (POSITIVE_MOODS.has(m)) pos += 1;
    else if (CONCERN_MOODS.has(m)) conc += 1;
  }
  const total = moodEntries.length;
  const posShare = pos / total;
  const concShare = conc / total;
  if (posShare >= 0.75) return "positive";
  if (concShare >= 0.75) return "concern";
  if (pos > 0 && conc > 0) return "mixed";
  return "neutral";
}

function buildHeadline(entries: JournalEntry[]): string {
  if (entries.length === 0) {
    return "No care notes recorded yet.";
  }
  // Longest body wins.
  let longest: JournalEntry | null = null;
  for (const e of entries) {
    if (!e.body) continue;
    if (!longest || (e.body.length ?? 0) > (longest.body?.length ?? 0)) {
      longest = e;
    }
  }
  if (longest && longest.body) {
    return firstSentence(longest.body, MAX_HEADLINE_CHARS);
  }
  // Fallback — mood + date.
  const mood = aggregateMood(entries);
  const dateLabel = new Date(entries[0].created_at).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short" },
  );
  return `${capitalise(mood)}-mood shift on ${dateLabel}.`;
}

function buildBullets(entries: JournalEntry[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (out.length >= MAX_BULLETS) break;
    const sentence = firstSentence(e.body);
    if (!sentence) continue;
    const norm = sentence.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(sentence);
  }
  return out;
}

function buildFlags(entries: JournalEntry[]): string[] {
  const flags: string[] = [];
  for (const e of entries) {
    if (e.kind === "incident" || e.mood === "distressed") {
      const snippet = (e.body ?? "").trim().slice(0, 80);
      const tag = e.kind === "incident" ? "Incident logged" : "Distress flagged";
      flags.push(snippet ? `${tag}: ${snippet}` : tag);
    } else if (e.mood === "unsettled") {
      const snippet = (e.body ?? "").trim().slice(0, 80);
      flags.push(snippet ? `Unsettled: ${snippet}` : "Unsettled mood logged");
    }
  }
  return flags.slice(0, 6);
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Booking-scope summary. Replaces any prior booking-scope summary for
 * the same booking_id (delete + insert keeps the file simple).
 */
export async function summarizeBooking(
  bookingId: string,
): Promise<CareSummary | null> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, recipient_ids, seeker_id")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      recipient_ids: string[] | null;
      seeker_id: string;
    }>();
  if (!booking) return null;

  const { data: rows } = await admin
    .from("care_journal_entries")
    .select(
      "id, author_id, booking_id, about_user_id, kind, mood, body, created_at",
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  const entries = (rows ?? []) as JournalEntry[];

  const headline = buildHeadline(entries);
  const bullets = buildBullets(entries);
  const mood_trend = aggregateMood(entries);
  const flags = buildFlags(entries);
  const sourceIds = entries.map((e) => e.id);

  // Delete existing booking summary then insert fresh.
  await admin
    .from("ai_care_summaries")
    .delete()
    .eq("scope", "booking")
    .eq("booking_id", bookingId);

  const { data, error } = await admin
    .from("ai_care_summaries")
    .insert({
      scope: "booking",
      booking_id: bookingId,
      recipient_id: null,
      family_id: null,
      period_start: null,
      period_end: null,
      headline,
      bullets,
      mood_trend,
      flags,
      source_entry_ids: sourceIds,
      model_version: AI_MODEL_VERSION,
    })
    .select(
      "id, scope, booking_id, recipient_id, family_id, period_start, period_end, headline, bullets, mood_trend, flags, source_entry_ids, computed_at",
    )
    .single();
  if (error || !data) return null;
  return rowToCareSummary(data);
}

/**
 * Period-scope summary for a recipient.
 */
export async function summarizePeriod({
  recipientId,
  scope,
  periodStart,
  periodEnd,
}: {
  recipientId: string;
  scope: Exclude<CareSummaryScope, "booking">;
  periodStart: string;
  periodEnd: string;
}): Promise<CareSummary | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("care_journal_entries")
    .select(
      "id, author_id, booking_id, about_user_id, kind, mood, body, created_at",
    )
    .eq("about_user_id", recipientId)
    .gte("created_at", periodStart)
    .lte("created_at", periodEnd)
    .order("created_at", { ascending: true });
  const entries = (rows ?? []) as JournalEntry[];

  const headline = buildHeadline(entries);
  const bullets = buildBullets(entries);
  const mood_trend = aggregateMood(entries);
  const flags = buildFlags(entries);
  const sourceIds = entries.map((e) => e.id);

  // Delete same-shape prior summary.
  await admin
    .from("ai_care_summaries")
    .delete()
    .eq("scope", scope)
    .eq("recipient_id", recipientId)
    .eq("period_start", periodStart);

  const { data, error } = await admin
    .from("ai_care_summaries")
    .insert({
      scope,
      booking_id: null,
      recipient_id: recipientId,
      family_id: null,
      period_start: periodStart,
      period_end: periodEnd,
      headline,
      bullets,
      mood_trend,
      flags,
      source_entry_ids: sourceIds,
      model_version: AI_MODEL_VERSION,
    })
    .select(
      "id, scope, booking_id, recipient_id, family_id, period_start, period_end, headline, bullets, mood_trend, flags, source_entry_ids, computed_at",
    )
    .single();
  if (error || !data) return null;
  return rowToCareSummary(data);
}

/**
 * Lookup latest summary for a booking or for a recipient/scope.
 */
export async function getLatestSummary(opts: {
  bookingId?: string;
  recipientId?: string;
  scope?: CareSummaryScope;
}): Promise<CareSummary | null> {
  const admin = createAdminClient();
  let q = admin
    .from("ai_care_summaries")
    .select(
      "id, scope, booking_id, recipient_id, family_id, period_start, period_end, headline, bullets, mood_trend, flags, source_entry_ids, computed_at",
    )
    .order("computed_at", { ascending: false })
    .limit(1);
  if (opts.bookingId) {
    q = q.eq("scope", "booking").eq("booking_id", opts.bookingId);
  } else if (opts.recipientId) {
    q = q.eq("recipient_id", opts.recipientId);
    if (opts.scope) q = q.eq("scope", opts.scope);
  } else {
    return null;
  }
  const { data } = await q;
  if (!data || data.length === 0) return null;
  return rowToCareSummary(data[0]);
}

function rowToCareSummary(r: Record<string, unknown>): CareSummary {
  return {
    id: r.id as string,
    scope: r.scope as CareSummaryScope,
    booking_id: (r.booking_id as string | null) ?? null,
    recipient_id: (r.recipient_id as string | null) ?? null,
    family_id: (r.family_id as string | null) ?? null,
    period_start: (r.period_start as string | null) ?? null,
    period_end: (r.period_end as string | null) ?? null,
    headline: r.headline as string,
    bullets: (r.bullets ?? []) as string[],
    mood_trend: r.mood_trend as MoodTrend,
    flags: (r.flags ?? []) as string[],
    source_entry_ids: (r.source_entry_ids ?? []) as string[],
    computed_at: r.computed_at as string,
  };
}

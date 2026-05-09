import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_MODEL_VERSION,
  type ScheduleSuggestion,
  type ScheduleSuggestionStatus,
} from "./types";

/**
 * Schedule predictions v1 — find recurring slots in a seeker's
 * completed-booking history. No ML; just bucket counts.
 */

const HISTORY_DAYS = 7 * 12; // 12 weeks
const MIN_OCCURRENCES = 3;
const CONFIDENCE_DENOM = 6; // occurrences/6 capped at 1
const MIN_CONFIDENCE_FOR_ACTIVE = 0.5;

type Booking = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  service_type: string | null;
  starts_at: string | null;
  status: string;
};

/**
 * Group seeker's last 12 weeks of completed bookings by
 * (weekday, hour, service_type) and upsert predictions. Slots that
 * previously crossed the threshold but no longer do are marked
 * `expired` (only if they're still pending).
 */
export async function computePredictionsForSeeker(
  seekerId: string,
): Promise<{ upserts: number; expired: number }> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - HISTORY_DAYS);

  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, service_type, starts_at, status",
    )
    .eq("seeker_id", seekerId)
    .eq("status", "completed")
    .gte("starts_at", since.toISOString())
    .limit(2000);

  // Bucket: key = "wd|hr|service" → { count, carerCounts: Map<carerId,n> }
  type Bucket = {
    weekday: number;
    hour: number;
    service_type: string;
    count: number;
    carerCounts: Map<string, number>;
  };
  const buckets = new Map<string, Bucket>();
  for (const b of (bookings ?? []) as Booking[]) {
    if (!b.starts_at || !b.service_type) continue;
    const d = new Date(b.starts_at);
    if (Number.isNaN(d.getTime())) continue;
    const weekday = d.getDay(); // 0..6, matches Postgres extract(dow)
    const hour = d.getHours();
    const key = `${weekday}|${hour}|${b.service_type}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        weekday,
        hour,
        service_type: b.service_type,
        count: 0,
        carerCounts: new Map(),
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (b.caregiver_id) {
      bucket.carerCounts.set(
        b.caregiver_id,
        (bucket.carerCounts.get(b.caregiver_id) ?? 0) + 1,
      );
    }
  }

  // Upsert above-threshold buckets.
  let upserts = 0;
  const activeKeys = new Set<string>();
  for (const b of buckets.values()) {
    if (b.count < MIN_OCCURRENCES) continue;
    activeKeys.add(`${b.weekday}|${b.hour}|${b.service_type}`);
    const confidence = Math.min(b.count / CONFIDENCE_DENOM, 1);
    let topCarer: string | null = null;
    let topN = 0;
    for (const [cid, n] of b.carerCounts.entries()) {
      if (n > topN) {
        topCarer = cid;
        topN = n;
      }
    }
    // Manual upsert: select existing row, then update or insert. The
    // unique key is (seeker_id, weekday, hour, service_type) but we
    // must not overwrite rows whose status is 'accepted'.
    const { data: existing } = await admin
      .from("ai_schedule_predictions")
      .select("id, suggestion_status")
      .eq("seeker_id", seekerId)
      .eq("weekday", b.weekday)
      .eq("hour", b.hour)
      .eq("service_type", b.service_type)
      .maybeSingle<{ id: string; suggestion_status: string }>();

    if (existing) {
      if (existing.suggestion_status === "accepted") continue;
      const { error } = await admin
        .from("ai_schedule_predictions")
        .update({
          occurrences: b.count,
          confidence,
          caregiver_id: topCarer,
          // If it had been dismissed/expired, return to pending now
          // that the pattern re-emerged.
          suggestion_status: "pending",
          computed_at: new Date().toISOString(),
          model_version: AI_MODEL_VERSION,
        })
        .eq("id", existing.id);
      if (!error) upserts += 1;
    } else {
      const { error } = await admin.from("ai_schedule_predictions").insert({
        seeker_id: seekerId,
        weekday: b.weekday,
        hour: b.hour,
        service_type: b.service_type,
        caregiver_id: topCarer,
        occurrences: b.count,
        confidence,
        suggestion_status: "pending",
        model_version: AI_MODEL_VERSION,
      });
      if (!error) upserts += 1;
    }
  }

  // Expire pending rows that no longer pass the threshold.
  const { data: pendings } = await admin
    .from("ai_schedule_predictions")
    .select("id, weekday, hour, service_type")
    .eq("seeker_id", seekerId)
    .eq("suggestion_status", "pending");
  let expired = 0;
  for (const p of (pendings ?? []) as {
    id: string;
    weekday: number;
    hour: number;
    service_type: string;
  }[]) {
    const k = `${p.weekday}|${p.hour}|${p.service_type}`;
    if (!activeKeys.has(k)) {
      await admin
        .from("ai_schedule_predictions")
        .update({ suggestion_status: "expired" })
        .eq("id", p.id);
      expired += 1;
    }
  }
  return { upserts, expired };
}

/**
 * Active suggestions = pending + above-threshold confidence. Newest
 * first by computed_at.
 */
export async function getActiveSuggestions(
  seekerId: string,
  limit = 3,
): Promise<ScheduleSuggestion[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_schedule_predictions")
    .select(
      "id, seeker_id, weekday, hour, service_type, caregiver_id, occurrences, confidence, suggestion_status, acted_at, computed_at",
    )
    .eq("seeker_id", seekerId)
    .eq("suggestion_status", "pending")
    .gte("confidence", MIN_CONFIDENCE_FOR_ACTIVE)
    .order("computed_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    seeker_id: r.seeker_id as string,
    weekday: Number(r.weekday),
    hour: Number(r.hour),
    service_type: r.service_type as string,
    caregiver_id: (r.caregiver_id as string | null) ?? null,
    occurrences: Number(r.occurrences),
    confidence: Number(r.confidence),
    suggestion_status: r.suggestion_status as ScheduleSuggestionStatus,
    acted_at: (r.acted_at as string | null) ?? null,
    computed_at: r.computed_at as string,
  }));
}

/**
 * Update suggestion status (seeker action). Validates ownership.
 */
export async function updateSuggestionStatus(
  seekerId: string,
  suggestionId: string,
  status: "accepted" | "dismissed",
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data: row, error: rErr } = await admin
    .from("ai_schedule_predictions")
    .select("id, seeker_id, suggestion_status")
    .eq("id", suggestionId)
    .maybeSingle<{ id: string; seeker_id: string; suggestion_status: string }>();
  if (rErr || !row) {
    return { ok: false, error: "not_found" };
  }
  if (row.seeker_id !== seekerId) {
    return { ok: false, error: "forbidden" };
  }
  const { error } = await admin
    .from("ai_schedule_predictions")
    .update({
      suggestion_status: status,
      acted_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

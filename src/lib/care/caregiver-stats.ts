/**
 * Caregiver track-record stats — repeat-client rate, response time,
 * on-time rate. Sourced from the public.caregiver_stats materialized
 * view (see supabase/migrations/20260509_caregiver_stats.sql).
 *
 * The view holds raw counts; this module wraps them with the
 * 5-completed-bookings privacy threshold and rounds to display values.
 *
 * Stats stay hidden — the helper returns a "new carer" shape — until
 * a caregiver has at least MIN_BOOKINGS_FOR_STATS completed bookings,
 * because tiny samples produce misleading 0% / 100% numbers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Below this completed-bookings count we hide stats and show "New carer". */
export const MIN_BOOKINGS_FOR_STATS = 5;

export type CaregiverStatsRow = {
  caregiver_id: string;
  completed_bookings: number;
  repeat_client_rate: number | null;
  repeat_clients: number | null;
  total_clients: number | null;
  response_time_minutes: number | null;
  responded_count: number | null;
  on_time_rate: number | null;
  on_time_count: number | null;
  on_time_tracked: number | null;
  refreshed_at: string;
};

export type CaregiverStatsDisplay = {
  /** True when the carer has enough completed bookings for stats to be shown. */
  has_stats: boolean;
  completed_bookings: number;
  /** % 0..100, rounded. NULL when has_stats is false or no clients yet. */
  repeat_client_rate_pct: number | null;
  /** Median minutes, rounded. NULL until first response is recorded. */
  response_time_minutes: number | null;
  /** % 0..100, rounded. NULL until first tracked shift. */
  on_time_rate_pct: number | null;
};

const NEW_CARER: CaregiverStatsDisplay = {
  has_stats: false,
  completed_bookings: 0,
  repeat_client_rate_pct: null,
  response_time_minutes: null,
  on_time_rate_pct: null,
};

/**
 * Convert a raw stats row into the public-facing shape, applying the
 * minimum-bookings threshold. Returns the "new carer" shape when the
 * row is missing or the threshold isn't met.
 */
export function toDisplay(row: CaregiverStatsRow | null | undefined): CaregiverStatsDisplay {
  if (!row || row.completed_bookings < MIN_BOOKINGS_FOR_STATS) {
    return {
      ...NEW_CARER,
      completed_bookings: row?.completed_bookings ?? 0,
    };
  }
  return {
    has_stats: true,
    completed_bookings: row.completed_bookings,
    repeat_client_rate_pct:
      row.repeat_client_rate == null
        ? null
        : Math.round(row.repeat_client_rate * 100),
    response_time_minutes: row.response_time_minutes,
    on_time_rate_pct:
      row.on_time_rate == null ? null : Math.round(row.on_time_rate * 100),
  };
}

/**
 * Bulk-fetch stats for a set of caregiver IDs and return a Map keyed
 * by caregiver_id with the public display shape. Missing caregivers
 * default to the "new carer" shape.
 */
export async function fetchStatsByIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  caregiverIds: string[],
): Promise<Map<string, CaregiverStatsDisplay>> {
  const out = new Map<string, CaregiverStatsDisplay>();
  if (caregiverIds.length === 0) return out;

  const { data } = await client
    .from("caregiver_stats")
    .select(
      "caregiver_id, completed_bookings, repeat_client_rate, repeat_clients, total_clients, response_time_minutes, responded_count, on_time_rate, on_time_count, on_time_tracked, refreshed_at",
    )
    .in("caregiver_id", caregiverIds);

  const rows = (data ?? []) as unknown as CaregiverStatsRow[];
  const byId = new Map<string, CaregiverStatsRow>();
  for (const r of rows) byId.set(r.caregiver_id, r);

  for (const id of caregiverIds) {
    out.set(id, toDisplay(byId.get(id)));
  }
  return out;
}

/** Single-caregiver convenience — returns NEW_CARER when nothing found. */
export async function fetchStatsForId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  caregiverId: string,
): Promise<CaregiverStatsDisplay> {
  const map = await fetchStatsByIds(client, [caregiverId]);
  return map.get(caregiverId) ?? NEW_CARER;
}

/**
 * Format helpers — kept here so labels stay consistent across the
 * mobile profile, browse list, dashboard, and public profile.
 */
export function formatRepeatRate(pct: number | null): string | null {
  if (pct == null) return null;
  return `${pct}% repeat clients`;
}

export function formatResponseTime(min: number | null): string | null {
  if (min == null) return null;
  if (min < 1) return "Replies in <1 min";
  if (min < 60) return `Replies in ~${min} min`;
  const hours = Math.round((min / 60) * 10) / 10;
  return `Replies in ~${hours} hr`;
}

export function formatOnTimeRate(pct: number | null): string | null {
  if (pct == null) return null;
  return `${pct}% on time`;
}

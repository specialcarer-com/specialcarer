import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns the set of caregiver_ids that the given seeker has blocked.
 * Used by /api/instant-match and /api/browse-carers to filter results
 * before returning them to the client.
 *
 * Pass an admin (service-role) client — the helper is used from server
 * routes where we want to read the seeker's block list without RLS
 * roundtrips. Anonymous seekers always get an empty set.
 */
export async function getBlockedIdsForSeeker(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, any, any>,
  seekerId: string | null | undefined,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!seekerId) return out;
  const { data } = await client
    .from("blocked_caregivers")
    .select("caregiver_id")
    .eq("seeker_id", seekerId);
  for (const row of (data ?? []) as { caregiver_id: string }[]) {
    if (row.caregiver_id) out.add(row.caregiver_id);
  }
  return out;
}

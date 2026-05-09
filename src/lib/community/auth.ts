import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Verified carer" check used to gate forum writes.
 *
 * The codebase has no monolithic vetting flag (see
 * supabase/migrations/20260509_carer_vetting_v1.sql — vetting is
 * decomposed into references / certifications / skills attempts /
 * interview submissions). For 3.10 we use the simplest signal that
 * matches the in-app definition of "passed vetting": at least one
 * row in `carer_certifications` with `status = 'verified'`.
 *
 * Swap in a richer check (e.g. all components verified) by changing
 * this single function — call sites stay the same.
 */
export async function isVerifiedCarer(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("carer_certifications")
    .select("id", { count: "exact", head: true })
    .eq("carer_id", userId)
    .eq("status", "verified");
  return (count ?? 0) > 0;
}

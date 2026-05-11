import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AgencyOptInStatus =
  | "not_started"
  | "in_progress"
  | "ready_for_review"
  | "active"
  | "rejected"
  | "paused";

export type GatesRow = {
  user_id: string;
  agency_opt_in_status: AgencyOptInStatus;
  agency_opt_in_started_at: string | null;
  agency_opt_in_submitted_at: string | null;
  agency_opt_in_approved_at: string | null;
  agency_opt_in_rejected_reason: string | null;
  agency_opt_in_paused_reason: string | null;
  contract_ok: boolean | null;
  contract_countersigned_at: string | null;
  dbs_ok: boolean | null;
  dbs_cleared_at: string | null;
  rtw_ok: boolean | null;
  rtw_cleared_at: string | null;
  training_passed_count: number | null;
  training_required_count: number | null;
  training_ok: boolean | null;
  overall_ready: boolean | null;
};

/**
 * Load a single carer's row from v_agency_opt_in_gates.
 *
 * Pass a service-role admin client (createAdminClient()) so the view is
 * readable regardless of RLS. The function still scopes by user_id.
 */
export async function getGatesForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<GatesRow | null> {
  const { data, error } = await admin
    .from("v_agency_opt_in_gates")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[agency-optin] gates query failed", error);
    return null;
  }
  return (data as GatesRow | null) ?? null;
}

export function isUkCarer(country: string | null | undefined): boolean {
  if (!country) return false;
  return country.toUpperCase() === "GB" || country.toUpperCase() === "UK";
}

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
  works_with_adults: boolean | null;
  works_with_children: boolean | null;
  works_with_children_admin_approved_at: string | null;
  agency_optin_grace_period_until: string | null;
  in_grace_period: boolean | null;
  contract_ok: boolean | null;
  contract_countersigned_at: string | null;
  dbs_ok: boolean | null;
  dbs_cleared_at: string | null;
  rtw_ok: boolean | null;
  rtw_cleared_at: string | null;
  training_passed_count: number | null;
  training_required_count: number | null;
  training_ok: boolean | null;
  manual_handling_passed: boolean | null;
  infection_control_passed: boolean | null;
  food_hygiene_passed: boolean | null;
  medication_administration_passed: boolean | null;
  safeguarding_adults_passed: boolean | null;
  safeguarding_children_passed: boolean | null;
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

/**
 * Best-effort insert into agency_optin_audit_log. Never throws.
 */
export async function logAgencyOptinAudit(
  admin: SupabaseClient,
  args: {
    carer_id: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    changed_by_user_id: string | null;
  },
): Promise<void> {
  try {
    await admin.from("agency_optin_audit_log").insert({
      carer_id: args.carer_id,
      field: args.field,
      old_value: args.old_value,
      new_value: args.new_value,
      changed_by_user_id: args.changed_by_user_id,
    });
  } catch (e) {
    console.error("[agency-optin] audit log failed", e);
  }
}

/**
 * Returns true if the carer is still within their grace period AND active —
 * meaning we should keep treating them as 'active' even if their gates are
 * now red because of newly-mandatory courses. The cron sweep flips them off
 * once the grace window expires.
 */
export function isInGracePeriod(gates: GatesRow | null): boolean {
  if (!gates) return false;
  if (gates.agency_opt_in_status !== "active") return false;
  if (!gates.in_grace_period) return false;
  return true;
}

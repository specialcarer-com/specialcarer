/**
 * Server-only helpers for the organisation user type. Returns the
 * caller's org context (id, role, status) for the API + dashboard.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgRow } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type OrgMembership = {
  organization_id: string;
  user_id: string;
  role: "owner" | "admin" | "booker" | "viewer";
  full_name: string | null;
  job_title: string | null;
  job_title_other: string | null;
  work_email: string | null;
  phone: string | null;
  is_signatory: boolean;
};

/**
 * Returns the org membership row for the current user (single row in
 * Phase A). Uses an admin client so RLS doesn't elide it before the
 * caller's role is established. Only call from server routes that
 * have already authenticated the user.
 */
export async function getMyOrgMembership(
  admin: AnyClient,
  userId: string,
): Promise<OrgMembership | null> {
  const { data } = await admin
    .from("organization_members")
    .select(
      "organization_id, user_id, role, full_name, job_title, job_title_other, work_email, phone, is_signatory",
    )
    .eq("user_id", userId)
    .maybeSingle<OrgMembership>();
  return data ?? null;
}

export async function getOrg(
  admin: AnyClient,
  organizationId: string,
): Promise<OrgRow | null> {
  const { data } = await admin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle<OrgRow>();
  return data ?? null;
}

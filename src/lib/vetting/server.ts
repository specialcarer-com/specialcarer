/**
 * Server-side helpers that summarise a carer's vetting state.
 * Called by /api/carer/vetting-summary and the publish-route guard.
 *
 * All helpers take an admin (service-role) Supabase client because they
 * read across the carer's own rows AND the existing
 * `caregiver_verification` view, which aggregates DBS / Checkr status.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COURSE_MODULE_KEYS } from "./types";
import type {
  Vertical,
  VettingSummary,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

/** Did the carer pass the skills quiz in at least one vertical? */
export async function hasPassedAnyQuiz(
  admin: AdminClient,
  carerId: string,
): Promise<{ has_any_pass: boolean; verticals_passed: Vertical[] }> {
  const { data } = await admin
    .from("carer_skills_attempts")
    .select("vertical, passed")
    .eq("carer_id", carerId)
    .eq("passed", true);
  const set = new Set<Vertical>();
  for (const row of (data ?? []) as { vertical: Vertical; passed: boolean }[]) {
    set.add(row.vertical);
  }
  return {
    has_any_pass: set.size > 0,
    verticals_passed: Array.from(set),
  };
}

/** All 6 modules read AND knowledge check passed. */
export async function hasCompletedCourse(
  admin: AdminClient,
  carerId: string,
): Promise<{ completed_modules: number; total: number; complete: boolean }> {
  const { data } = await admin
    .from("carer_course_progress")
    .select("module_key, read_at, knowledge_check_correct")
    .eq("carer_id", carerId);
  const rows = (data ?? []) as {
    module_key: string;
    read_at: string | null;
    knowledge_check_correct: boolean | null;
  }[];
  const byKey = new Map(rows.map((r) => [r.module_key, r]));
  let done = 0;
  for (const k of COURSE_MODULE_KEYS) {
    const r = byKey.get(k);
    if (r && r.read_at && r.knowledge_check_correct === true) done += 1;
  }
  const total = COURSE_MODULE_KEYS.length;
  return { completed_modules: done, total, complete: done === total };
}

/** "Complete" when at least 2 of 3 references are verified. */
export async function getReferencesStatus(
  admin: AdminClient,
  carerId: string,
): Promise<{ verified: number; total: number; complete: boolean }> {
  const { data } = await admin
    .from("carer_references")
    .select("status")
    .eq("carer_id", carerId);
  const rows = (data ?? []) as { status: string }[];
  const verified = rows.filter((r) => r.status === "verified").length;
  return { verified, total: rows.length, complete: verified >= 2 };
}

export async function getCertificationsCount(
  admin: AdminClient,
  carerId: string,
): Promise<{ verified: number; pending: number }> {
  const { data } = await admin
    .from("carer_certifications")
    .select("status")
    .eq("carer_id", carerId);
  const rows = (data ?? []) as { status: string }[];
  return {
    verified: rows.filter((r) => r.status === "verified").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };
}

/** All 3 prompts approved by admin. */
export async function hasInterviewApproved(
  admin: AdminClient,
  carerId: string,
): Promise<{ approved: number; required: number; complete: boolean }> {
  const { data } = await admin
    .from("carer_interview_submissions")
    .select("prompt_index, status")
    .eq("carer_id", carerId)
    .eq("status", "approved");
  const approved = new Set(
    ((data ?? []) as { prompt_index: number }[]).map((r) => r.prompt_index),
  );
  return {
    approved: approved.size,
    required: 3,
    complete: approved.size >= 3,
  };
}

/**
 * Read the existing caregiver_verification view to determine whether
 * the country-required background checks are all cleared. The view
 * exposes per-country booleans like `gb_fully_cleared` / `us_fully_cleared`.
 */
export async function getBackgroundChecksComplete(
  admin: AdminClient,
  carerId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("caregiver_verification")
    .select(
      "user_id, country, gb_fully_cleared, us_fully_cleared, fully_cleared",
    )
    .eq("user_id", carerId)
    .maybeSingle<{
      user_id: string;
      country: string | null;
      gb_fully_cleared: boolean | null;
      us_fully_cleared: boolean | null;
      fully_cleared: boolean | null;
    }>();
  if (!data) return false;
  if (typeof data.fully_cleared === "boolean") return data.fully_cleared;
  // Fall back to country-specific flag if available.
  if (data.country === "US") return !!data.us_fully_cleared;
  return !!data.gb_fully_cleared;
}

/**
 * Aggregated summary used by the dashboard hub and the publish guard.
 * `is_fully_vetted` is true when every step is complete.
 */
export async function getVettingSummary(
  admin: AdminClient,
  carerId: string,
): Promise<VettingSummary> {
  const [
    references,
    certifications,
    skills,
    interview,
    course,
    bgComplete,
  ] = await Promise.all([
    getReferencesStatus(admin, carerId),
    getCertificationsCount(admin, carerId),
    hasPassedAnyQuiz(admin, carerId),
    hasInterviewApproved(admin, carerId),
    hasCompletedCourse(admin, carerId),
    getBackgroundChecksComplete(admin, carerId),
  ]);

  const is_fully_vetted =
    references.complete &&
    certifications.verified > 0 &&
    skills.has_any_pass &&
    interview.complete &&
    course.complete &&
    bgComplete;

  return {
    references,
    certifications,
    skills,
    interview,
    course,
    background_checks_complete: bgComplete,
    is_fully_vetted,
  };
}

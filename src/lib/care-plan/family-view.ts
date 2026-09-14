/**
 * Server-side data-access for the family-facing care-plan viewer.
 *
 * All reads go through the user-scoped SSR client so the existing RLS on
 * care_plans, medications, allergies, care_plan_reviews, and household_recipients
 * naturally decides who sees what. This module NEVER uses the admin client.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  AllergyRow,
  CarePlanRow,
  MedicationRow,
} from "./types";
import type { CarePlanReviewRow } from "./reviews";

export type FamilyRecipientTile = {
  id: string;
  display_name: string;
  photo_url: string | null;
  family_id: string | null;
  /** Latest care_plans row for this recipient (may be null if none yet). */
  latest_care_plan_id: string | null;
  /** Newest upcoming/overdue review row across this recipient's care plans. */
  next_review: Pick<
    CarePlanReviewRow,
    "id" | "status" | "scheduled_for" | "cadence_months"
  > | null;
};

/**
 * List the recipients belonging to the family the caller can currently
 * see. Read scope = anything the RLS on household_recipients grants
 * (owner + active family_members).
 */
export async function listFamilyRecipientsForCaller(
  familyId: string | null,
): Promise<FamilyRecipientTile[]> {
  if (!familyId) return [];
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("household_recipients")
    .select("id, display_name, photo_url, family_id")
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[care-plan family-view] listRecipients failed", error);
    return [];
  }

  const recipients = (rows ?? []) as Array<{
    id: string;
    display_name: string;
    photo_url: string | null;
    family_id: string | null;
  }>;
  if (recipients.length === 0) return [];

  // Latest care_plan_id per recipient (from the view we ship in this
  // migration). RLS on the underlying tables applies transparently.
  const { data: latestRows, error: latestErr } = await supabase
    .from("care_plan_latest_for_recipient")
    .select("recipient_id, id")
    .in(
      "recipient_id",
      recipients.map((r) => r.id),
    );
  if (latestErr) {
    console.error("[care-plan family-view] latest fetch failed", latestErr);
  }
  const latestByRecipient = new Map<string, string>();
  for (const r of (latestRows ?? []) as Array<{
    recipient_id: string;
    id: string;
  }>) {
    latestByRecipient.set(r.recipient_id, r.id);
  }

  // For each recipient with a latest care plan, fetch the next
  // upcoming/overdue review (single row, cheap query).
  const carePlanIds = Array.from(latestByRecipient.values());
  const reviewByPlan = new Map<
    string,
    Pick<
      CarePlanReviewRow,
      "id" | "status" | "scheduled_for" | "cadence_months"
    >
  >();
  if (carePlanIds.length > 0) {
    const { data: reviewRows, error: revErr } = await supabase
      .from("care_plan_reviews")
      .select("id, care_plan_id, status, scheduled_for, cadence_months")
      .in("care_plan_id", carePlanIds)
      .in("status", ["due", "in_progress", "overdue"])
      .order("scheduled_for", { ascending: true });
    if (revErr) {
      console.error("[care-plan family-view] reviews fetch failed", revErr);
    }
    for (const r of (reviewRows ?? []) as Array<{
      id: string;
      care_plan_id: string;
      status: CarePlanReviewRow["status"];
      scheduled_for: string;
      cadence_months: CarePlanReviewRow["cadence_months"];
    }>) {
      if (!reviewByPlan.has(r.care_plan_id)) {
        reviewByPlan.set(r.care_plan_id, {
          id: r.id,
          status: r.status,
          scheduled_for: r.scheduled_for,
          cadence_months: r.cadence_months,
        });
      }
    }
  }

  return recipients.map((r) => {
    const planId = latestByRecipient.get(r.id) ?? null;
    return {
      id: r.id,
      display_name: r.display_name,
      photo_url: r.photo_url,
      family_id: r.family_id,
      latest_care_plan_id: planId,
      next_review: planId ? reviewByPlan.get(planId) ?? null : null,
    };
  });
}

export type FamilyCarePlanView = {
  recipient: {
    id: string;
    display_name: string;
    photo_url: string | null;
    date_of_birth: string | null;
  };
  plan: CarePlanRow | null;
  medications: MedicationRow[];
  allergies: AllergyRow[];
};

/**
 * Read the read-only care-plan bundle for one recipient. Returns
 * `plan = null` when the recipient has no care_plan on any booking yet.
 *
 * All queries run through the caller's user-scoped client — a family
 * member without RLS visibility will simply see `plan = null`.
 */
export async function getFamilyCarePlanForRecipient(
  recipientId: string,
): Promise<FamilyCarePlanView | null> {
  const supabase = await createClient();

  const { data: recipientRow, error: recipientErr } = await supabase
    .from("household_recipients")
    .select("id, display_name, photo_url, date_of_birth")
    .eq("id", recipientId)
    .maybeSingle();
  if (recipientErr) {
    console.error("[care-plan family-view] recipient fetch failed", recipientErr);
    return null;
  }
  if (!recipientRow) return null;

  const { data: latestRow, error: latestErr } = await supabase
    .from("care_plan_latest_for_recipient")
    .select(
      "id, booking_id, recipient_name, recipient_dob, address_line1, address_line2, city, postcode, goals, special_instructions, routine_notes, updated_at",
    )
    .eq("recipient_id", recipientId)
    .maybeSingle();
  if (latestErr) {
    console.error("[care-plan family-view] latest fetch failed", latestErr);
  }

  const plan = (latestRow ?? null) as CarePlanRow | null;
  if (!plan) {
    return {
      recipient: recipientRow as FamilyCarePlanView["recipient"],
      plan: null,
      medications: [],
      allergies: [],
    };
  }

  const [{ data: meds }, { data: allergies }] = await Promise.all([
    supabase
      .from("medications")
      .select("id, name, dose, schedule, notes, position")
      .eq("care_plan_id", plan.id)
      .order("position", { ascending: true }),
    supabase
      .from("allergies")
      .select("id, substance, severity, reaction, notes, position")
      .eq("care_plan_id", plan.id)
      .order("position", { ascending: true }),
  ]);

  return {
    recipient: recipientRow as FamilyCarePlanView["recipient"],
    plan,
    medications: (meds ?? []) as MedicationRow[],
    allergies: (allergies ?? []) as AllergyRow[],
  };
}

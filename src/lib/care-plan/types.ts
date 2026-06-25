/**
 * Shared row shapes for the care-plan PDF endpoint.
 *
 * These mirror the columns in supabase/migrations/20260527135259_care_plan_schema.sql
 * (care_plans, medications, allergies) plus the bits of bookings / profiles /
 * emergency_contacts we read for the cover page and emergency-contacts table.
 */

export type CarePlanBookingRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  service_type: string | null;
  location_city: string | null;
  notes: string | null;
};

export type CarePlanProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
};

export type CarePlanRow = {
  id: string;
  booking_id: string;
  recipient_name: string | null;
  recipient_dob: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  goals: string[] | null;
  special_instructions: string | null;
  routine_notes: string | null;
  updated_at: string | null;
};

export type MedicationRow = {
  id: string;
  name: string;
  dose: string | null;
  schedule: string | null;
  notes: string | null;
  position: number;
};

export type AllergyRow = {
  id: string;
  substance: string;
  severity: string | null;
  reaction: string | null;
  notes: string | null;
  position: number;
};

export type EmergencyContactRow = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
};

export type BookingTaskRowMinimal = {
  id: string;
  label: string;
  done: boolean;
  done_at: string | null;
  position: number;
};

/** Vertical id → human label. Matches the brand 5-vertical canon. */
export const VERTICAL_LABELS: Record<string, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
  // Legacy / loose values seen in bookings.service_type.
  elderly: "Elderly care",
  home_support: "Home support",
};

export function verticalLabel(serviceType: string | null | undefined): string {
  if (!serviceType) return "Care";
  return VERTICAL_LABELS[serviceType] ?? serviceType;
}

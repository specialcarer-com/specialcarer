import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleCarePlanPdf,
  type CarePlanClient,
} from "@/lib/care-plan/pdf-handler";
import type {
  AllergyRow,
  BookingTaskRowMinimal,
  CarePlanBookingRow,
  CarePlanProfileRow,
  CarePlanRow,
  EmergencyContactRow,
  MedicationRow,
} from "@/lib/care-plan/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/bookings/[id]/care-plan.pdf
 *
 * Streams a freshly-rendered care-plan PDF. Visible to the seeker, the
 * assigned carer, and admins. 403 otherwise; 404 if the booking is
 * missing.
 *
 * The handler is tolerant of missing care_plans / medications /
 * allergies / emergency_contacts data — see pdf-handler.ts.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: booking_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client: CarePlanClient = {
    async getBooking(id) {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, seeker_id, caregiver_id, status, starts_at, ends_at, service_type, location_city, notes",
        )
        .eq("id", id)
        .maybeSingle<CarePlanBookingRow>();
      return { data, error };
    },
    async getCarePlan(id) {
      const { data, error } = await supabase
        .from("care_plans")
        .select(
          "id, booking_id, recipient_name, recipient_dob, address_line1, address_line2, city, postcode, goals, special_instructions, routine_notes, updated_at",
        )
        .eq("booking_id", id)
        .maybeSingle<CarePlanRow>();
      return { data, error };
    },
    async listMedications(carePlanId) {
      const { data, error } = await supabase
        .from("medications")
        .select("id, name, dose, schedule, notes, position")
        .eq("care_plan_id", carePlanId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      return { data: (data as MedicationRow[] | null) ?? null, error };
    },
    async listAllergies(carePlanId) {
      const { data, error } = await supabase
        .from("allergies")
        .select("id, substance, severity, reaction, notes, position")
        .eq("care_plan_id", carePlanId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      return { data: (data as AllergyRow[] | null) ?? null, error };
    },
    async listTasks(id) {
      const { data, error } = await supabase
        .from("booking_tasks")
        .select("id, label, done, done_at, position")
        .eq("booking_id", id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      return { data: (data as BookingTaskRowMinimal[] | null) ?? null, error };
    },
    async listEmergencyContacts(ownerId) {
      const { data, error } = await supabase
        .from("emergency_contacts")
        .select("id, name, phone, relationship")
        .eq("owner_id", ownerId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      return { data: (data as EmergencyContactRow[] | null) ?? null, error };
    },
    async getProfile(uid) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", uid)
        .maybeSingle<CarePlanProfileRow>();
      return { data, error };
    },
    async isAdmin(uid) {
      try {
        const admin = createAdminClient();
        const { data } = await admin.rpc("is_admin", { uid });
        return Boolean(data);
      } catch {
        return false;
      }
    },
  };

  return handleCarePlanPdf({
    user_id: user.id,
    booking_id,
    client,
  });
}

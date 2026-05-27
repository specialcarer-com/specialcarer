/**
 * Pure handler for GET /api/m/bookings/[id]/care-plan.pdf.
 *
 * The route resolves auth + builds a thin Supabase adapter; this module
 * does the authorisation gate, fans out the reads via the client
 * interface, and calls into the renderer. Same shape as the
 * booking-tasks list-handler so tests can drive it with a stubbed
 * client and assert on the NextResponse without going through
 * next/headers.
 *
 * The PDF endpoint must be tolerant of missing data — care_plans /
 * medications / allergies / emergency_contacts / booking_tasks are
 * optional. If a sub-query returns an error we treat it as "no data"
 * and still render the PDF; only the booking lookup is hard-required.
 */
import { NextResponse } from "next/server";
import { renderCarePlanPdf } from "./render";
import type {
  AllergyRow,
  BookingTaskRowMinimal,
  CarePlanBookingRow,
  CarePlanProfileRow,
  CarePlanRow,
  EmergencyContactRow,
  MedicationRow,
} from "./types";

/** Thin DB interface. `null` data → treated as "empty" (graceful). */
export type CarePlanClient = {
  getBooking(
    bookingId: string,
  ): Promise<{
    data: CarePlanBookingRow | null;
    error: { message: string } | null;
  }>;
  getCarePlan(
    bookingId: string,
  ): Promise<{
    data: CarePlanRow | null;
    error: { message: string } | null;
  }>;
  listMedications(
    carePlanId: string,
  ): Promise<{
    data: MedicationRow[] | null;
    error: { message: string } | null;
  }>;
  listAllergies(
    carePlanId: string,
  ): Promise<{
    data: AllergyRow[] | null;
    error: { message: string } | null;
  }>;
  listTasks(
    bookingId: string,
  ): Promise<{
    data: BookingTaskRowMinimal[] | null;
    error: { message: string } | null;
  }>;
  listEmergencyContacts(
    ownerId: string,
  ): Promise<{
    data: EmergencyContactRow[] | null;
    error: { message: string } | null;
  }>;
  getProfile(
    userId: string,
  ): Promise<{
    data: CarePlanProfileRow | null;
    error: { message: string } | null;
  }>;
  isAdmin(userId: string): Promise<boolean>;
};

export type HandleCarePlanPdfInput = {
  user_id: string;
  booking_id: string;
  client: CarePlanClient;
  /** Injected for deterministic filenames in tests. */
  now?: Date;
};

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function handleCarePlanPdf(
  input: HandleCarePlanPdfInput,
): Promise<NextResponse> {
  const { user_id, booking_id, client } = input;
  const now = input.now ?? new Date();

  // 1) Booking lookup — hard-required.
  const booking = await client.getBooking(booking_id);
  if (booking.error) {
    return NextResponse.json(
      { error: "Failed to load booking" },
      { status: 500 },
    );
  }
  if (!booking.data) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // 2) Authorisation — seeker / carer / admin.
  const isParty =
    booking.data.seeker_id === user_id ||
    booking.data.caregiver_id === user_id;
  if (!isParty) {
    const adminOverride = await client.isAdmin(user_id);
    if (!adminOverride) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // 3) Fan out the rest. Each is treated as "empty" if it errors so a
  //    missing care_plans table (drift) doesn't 500 the PDF.
  const [plan, tasks, seekerProf, carerProf, contacts] = await Promise.all([
    client.getCarePlan(booking_id).catch(() => ({ data: null, error: null })),
    client.listTasks(booking_id).catch(() => ({ data: null, error: null })),
    client
      .getProfile(booking.data.seeker_id)
      .catch(() => ({ data: null, error: null })),
    client
      .getProfile(booking.data.caregiver_id)
      .catch(() => ({ data: null, error: null })),
    client
      .listEmergencyContacts(booking.data.seeker_id)
      .catch(() => ({ data: null, error: null })),
  ]);

  let meds: MedicationRow[] = [];
  let allergies: AllergyRow[] = [];
  if (plan.data?.id) {
    const [m, a] = await Promise.all([
      client
        .listMedications(plan.data.id)
        .catch(() => ({ data: null, error: null })),
      client
        .listAllergies(plan.data.id)
        .catch(() => ({ data: null, error: null })),
    ]);
    meds = m.data ?? [];
    allergies = a.data ?? [];
  }

  // 4) Render.
  const pdfBytes = await renderCarePlanPdf({
    booking: booking.data,
    carePlan: plan.data ?? null,
    medications: meds,
    allergies,
    tasks: tasks.data ?? [],
    emergencyContacts: contacts.data ?? [],
    seeker: seekerProf.data ?? null,
    carer: carerProf.data ?? null,
    generatedAt: now,
  });

  // 5) Respond.
  const filename = `care-plan-${booking.data.id}-${yyyymmdd(now)}.pdf`;
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

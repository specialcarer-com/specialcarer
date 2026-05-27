/**
 * Tests for the care-plan PDF handler.
 *
 * We drive the pure handler with a stubbed CarePlanClient so the test
 * stays away from next/headers + cookie machinery, and assert on:
 *
 *   • 200 with application/pdf, sensible byte length, %PDF magic
 *   • Content-Disposition filename pattern care-plan-<id>-<YYYYMMDD>.pdf
 *   • Cache-Control: private, no-store
 *   • 403 for an unrelated user
 *   • 404 when the booking is missing
 *   • 500 when the booking lookup itself errors
 *   • Graceful rendering when care_plans / tasks / contacts are missing
 *     (i.e. a fresh booking with no care plan yet still returns a PDF)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

const SEEKER = "00000000-0000-0000-0000-000000000001";
const CARER = "00000000-0000-0000-0000-000000000002";
const STRANGER = "00000000-0000-0000-0000-000000000003";
const ADMIN = "00000000-0000-0000-0000-000000000004";
const BOOKING = "00000000-0000-0000-0000-0000000000aa";
const CARE_PLAN = "00000000-0000-0000-0000-0000000000bb";
const FIXED_NOW = new Date("2026-05-27T09:30:00.000Z");

function bookingRow(): CarePlanBookingRow {
  return {
    id: BOOKING,
    seeker_id: SEEKER,
    caregiver_id: CARER,
    status: "in_progress",
    starts_at: "2026-05-27T08:00:00.000Z",
    ends_at: "2026-05-27T18:00:00.000Z",
    service_type: "elderly_care",
    location_city: "London",
    notes: null,
  };
}

function carePlanRow(): CarePlanRow {
  return {
    id: CARE_PLAN,
    booking_id: BOOKING,
    recipient_name: "Mrs Edith Hughes",
    recipient_dob: "1938-04-12",
    address_line1: "14 Acacia Avenue",
    address_line2: null,
    city: "London",
    postcode: "N1 5AB",
    goals: [
      "Support with morning routine and dressing",
      "Encourage 20-minute walk around the garden each day",
      "Companionship and conversation",
    ],
    special_instructions:
      "Edith prefers to be addressed as Mrs Hughes. Hearing aid is in the bedside drawer — please check it is in before breakfast.",
    routine_notes: "Tea at 7am, lunch at 12:30, light supper at 6pm.",
    updated_at: "2026-05-26T16:00:00.000Z",
  };
}

function medRows(): MedicationRow[] {
  return [
    {
      id: "m1",
      name: "Donepezil",
      dose: "5mg",
      schedule: "Once daily, morning",
      notes: "With food",
      position: 0,
    },
    {
      id: "m2",
      name: "Paracetamol",
      dose: "500mg",
      schedule: "PRN, max 4/day",
      notes: null,
      position: 1,
    },
  ];
}

function allergyRows(): AllergyRow[] {
  return [
    {
      id: "a1",
      substance: "Penicillin",
      severity: "severe",
      reaction: "Rash, swelling",
      notes: null,
      position: 0,
    },
  ];
}

function taskRows(): BookingTaskRowMinimal[] {
  return [
    {
      id: "t1",
      label: "Help with bath and dressing",
      done: true,
      done_at: "2026-05-27T08:15:00.000Z",
      position: 0,
    },
    {
      id: "t2",
      label: "Medication round at 10am",
      done: false,
      done_at: null,
      position: 1,
    },
  ];
}

function contactRows(): EmergencyContactRow[] {
  return [
    {
      id: "ec1",
      name: "Daniel Hughes",
      phone: "+44 7700 900123",
      relationship: "Son",
    },
  ];
}

function profileRow(id: string, name: string): CarePlanProfileRow {
  return { id, full_name: name, avatar_url: null };
}

function client(overrides?: Partial<CarePlanClient>): CarePlanClient {
  return {
    async getBooking() {
      return { data: bookingRow(), error: null };
    },
    async getCarePlan() {
      return { data: carePlanRow(), error: null };
    },
    async listMedications() {
      return { data: medRows(), error: null };
    },
    async listAllergies() {
      return { data: allergyRows(), error: null };
    },
    async listTasks() {
      return { data: taskRows(), error: null };
    },
    async listEmergencyContacts() {
      return { data: contactRows(), error: null };
    },
    async getProfile(uid) {
      if (uid === SEEKER) return { data: profileRow(uid, "Mrs Edith Hughes"), error: null };
      if (uid === CARER) return { data: profileRow(uid, "Priya Sharma"), error: null };
      return { data: null, error: null };
    },
    async isAdmin() {
      return false;
    },
    ...overrides,
  };
}

describe("handleCarePlanPdf", () => {
  it("returns 200 application/pdf for the seeker on the booking", async () => {
    const res = await handleCarePlanPdf({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client(),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/pdf");
    assert.equal(res.headers.get("Cache-Control"), "private, no-store");
    const buf = Buffer.from(await res.arrayBuffer());
    // PDF magic.
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
    // Real PDF — should be well over 2KB given the content rendered.
    assert.ok(buf.byteLength > 2000, `pdf too small: ${buf.byteLength}`);
  });

  it("returns 200 for the carer on the booking", async () => {
    const res = await handleCarePlanPdf({
      user_id: CARER,
      booking_id: BOOKING,
      client: client(),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 200);
  });

  it("returns 200 for an admin not party to the booking", async () => {
    const res = await handleCarePlanPdf({
      user_id: ADMIN,
      booking_id: BOOKING,
      client: client({
        async isAdmin() {
          return true;
        },
      }),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 200);
  });

  it("sets Content-Disposition filename to care-plan-<bookingId>-<YYYYMMDD>.pdf", async () => {
    const res = await handleCarePlanPdf({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client(),
      now: FIXED_NOW,
    });
    const disp = res.headers.get("Content-Disposition") ?? "";
    assert.match(
      disp,
      new RegExp(
        `^attachment; filename="care-plan-${BOOKING}-20260527\\.pdf"$`,
      ),
    );
  });

  it("returns 403 for an unrelated, non-admin user", async () => {
    const res = await handleCarePlanPdf({
      user_id: STRANGER,
      booking_id: BOOKING,
      client: client(),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleCarePlanPdf({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client({
        async getBooking() {
          return { data: null, error: null };
        },
      }),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when booking lookup errors", async () => {
    const res = await handleCarePlanPdf({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client({
        async getBooking() {
          return { data: null, error: { message: "db down" } };
        },
      }),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 500);
  });

  it("still returns a PDF when care_plans / tasks / contacts are missing", async () => {
    // Simulate a fresh booking — no care plan row, no tasks, no
    // contacts, and the medications/allergies listers throwing because
    // the tables exist but the care_plan_id query failed. The handler
    // should swallow those errors and still produce a valid PDF.
    const res = await handleCarePlanPdf({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client({
        async getCarePlan() {
          return { data: null, error: null };
        },
        async listMedications() {
          throw new Error("relation \"medications\" does not exist");
        },
        async listAllergies() {
          throw new Error("relation \"allergies\" does not exist");
        },
        async listTasks() {
          return { data: [], error: null };
        },
        async listEmergencyContacts() {
          return { data: [], error: null };
        },
      }),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
    assert.ok(buf.byteLength > 1000);
  });

  it("survives a booking with no carer profile (carer profile null)", async () => {
    const res = await handleCarePlanPdf({
      user_id: SEEKER,
      booking_id: BOOKING,
      client: client({
        async getProfile(uid) {
          if (uid === SEEKER)
            return { data: profileRow(uid, "Mrs Edith Hughes"), error: null };
          return { data: null, error: null };
        },
      }),
      now: FIXED_NOW,
    });
    assert.equal(res.status, 200);
  });
});

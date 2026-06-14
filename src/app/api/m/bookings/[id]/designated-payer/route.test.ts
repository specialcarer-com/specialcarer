/**
 * Tests for the Designated Payer handlers (gap 31).
 *
 * Drives the pure handlers with a stubbed client (matches list-handler
 * conventions) so we don't pull in next/headers + cookie machinery.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleGetDesignatedPayer,
  handleSetDesignatedPayer,
  type DesignatedPayerClient,
  type DesignatedPayerBookingRow,
} from "@/lib/family/designated-payer-handler";
import type { HouseholdMember } from "@/lib/family/household";

const SEEKER = "00000000-0000-0000-0000-000000000001";
const PAYER = "00000000-0000-0000-0000-000000000002";
const STRANGER = "00000000-0000-0000-0000-000000000003";
const OUTSIDER = "00000000-0000-0000-0000-000000000009";
const BOOKING = "00000000-0000-0000-0000-0000000000aa";
const FAMILY = "00000000-0000-0000-0000-0000000000ff";

function booking(
  payer: string | null = null,
): DesignatedPayerBookingRow {
  return { id: BOOKING, seeker_id: SEEKER, designated_payer_user_id: payer };
}

function members(): HouseholdMember[] {
  return [
    { user_id: SEEKER, display_name: "Pat Seeker" },
    { user_id: PAYER, display_name: "Alex Adult-Child" },
  ];
}

function client(
  overrides?: Partial<DesignatedPayerClient> & { payer?: string | null },
): DesignatedPayerClient {
  const base: DesignatedPayerClient = {
    async getBooking() {
      return { data: booking(overrides?.payer ?? null), error: null };
    },
    async setDesignatedPayer() {
      return { error: null };
    },
    async getOwnFamilyId() {
      return { familyId: FAMILY, error: null };
    },
    async listActiveMembers() {
      return {
        members: [{ user_id: PAYER, display_name: "Alex Adult-Child" }],
        error: null,
      };
    },
    async getUserName(uid) {
      return members().find((m) => m.user_id === uid)?.display_name ?? null;
    },
  };
  return { ...base, ...overrides };
}

describe("handleGetDesignatedPayer", () => {
  it("returns 403 feature disabled when the flag is off", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "feature disabled");
  });

  it("returns 200 with current payer + household for the seeker", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client({ payer: PAYER }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      designatedPayerUserId: string | null;
      designatedPayerName: string | null;
      isFlagEnabled: boolean;
      householdAdults: HouseholdMember[];
    };
    assert.equal(body.designatedPayerUserId, PAYER);
    assert.equal(body.designatedPayerName, "Alex Adult-Child");
    assert.equal(body.isFlagEnabled, true);
    assert.deepEqual(
      body.householdAdults.map((m) => m.user_id),
      [SEEKER, PAYER],
    );
  });

  it("returns 403 for a non-seeker", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: STRANGER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client({
        async getBooking() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when the booking lookup fails", async () => {
    const res = await handleGetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      flagEnabled: true,
      client: client({
        async getBooking() {
          return { data: null, error: { message: "boom" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

describe("handleSetDesignatedPayer", () => {
  it("returns 403 feature disabled when the flag is off", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: false,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 200 when the seeker sets a valid household payer", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      designatedPayerUserId: string | null;
      designatedPayerName: string | null;
    };
    assert.equal(body.designatedPayerUserId, PAYER);
    assert.equal(body.designatedPayerName, "Alex Adult-Child");
  });

  it("returns 200 when the seeker clears the payer (null)", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: null,
      flagEnabled: true,
      client: client({ payer: PAYER }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { designatedPayerUserId: string | null };
    assert.equal(body.designatedPayerUserId, null);
  });

  it("returns 400 when the target user is not in the household", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: OUTSIDER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when payerUserId is the wrong type", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: 123,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 when payerUserId is an empty string", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: "   ",
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 400);
  });

  it("returns 403 for a non-seeker", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: STRANGER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client(),
    });
    assert.equal(res.status, 403);
  });

  it("returns 404 when the booking does not exist", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client({
        async getBooking() {
          return { data: null, error: null };
        },
      }),
    });
    assert.equal(res.status, 404);
  });

  it("returns 500 when the update fails", async () => {
    const res = await handleSetDesignatedPayer({
      user_id: SEEKER,
      booking_id: BOOKING,
      payerUserId: PAYER,
      flagEnabled: true,
      client: client({
        async setDesignatedPayer() {
          return { error: { message: "db down" } };
        },
      }),
    });
    assert.equal(res.status, 500);
  });
});

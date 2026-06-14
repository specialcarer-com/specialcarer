/**
 * Tests for detectUsualSlot (gap 23 — predictive scheduling).
 *
 * Drives the pure helper with a stubbed Supabase client so we avoid
 * next/headers + cookie machinery (matches src/lib/carers/recent-handler
 * test style).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectUsualSlot,
  type UsualSlotClient,
} from "@/lib/predictions/usualSlot";

type BookingRow = {
  id: string;
  caregiver_id: string | null;
  service_type: string | null;
  starts_at: string | null;
};

function makeClient(opts: {
  bookings: BookingRow[];
  names?: Record<string, string>;
  bookingsError?: { message: string } | null;
}): UsualSlotClient {
  const names = opts.names ?? {};
  return {
    from(table: "bookings" | "caregiver_profiles" | "profiles") {
      if (table === "bookings") {
        return {
          select() {
            return {
              eq(_c: "seeker_id", _v: string) {
                return {
                  eq(_c2: "status", _v2: string) {
                    return {
                      gte(_c3: "starts_at", _v3: string) {
                        return {
                          async order(
                            _c4: "starts_at",
                            _o: { ascending: boolean },
                          ) {
                            if (opts.bookingsError) {
                              return { data: null, error: opts.bookingsError };
                            }
                            return { data: opts.bookings, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "caregiver_profiles") {
        return {
          select() {
            return {
              eq(_c: "user_id", id: string) {
                return {
                  async maybeSingle() {
                    const name = names[id];
                    return {
                      data: name
                        ? { user_id: id, display_name: name }
                        : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      // profiles
      return {
        select() {
          return {
            eq(_c: "id", _id: string) {
              return {
                async maybeSingle() {
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as UsualSlotClient;
}

const SEEKER = "11111111-2222-3333-4444-555555555555";
const C1 = "aaaaaaaa-0000-0000-0000-000000000001";
const C2 = "aaaaaaaa-0000-0000-0000-000000000002";

// 2026-06-14 is a Sunday; fix "now" so the 90-day window is stable.
const NOW = new Date("2026-06-14T12:00:00Z");

describe("detectUsualSlot", () => {
  it("returns the slot when a carer/service/dow/hour repeats 2+ times", async () => {
    // Two Tuesday-09:00 childcare bookings with C1.
    const bookings: BookingRow[] = [
      { id: "b1", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" },
      { id: "b2", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-02T09:00:00Z" },
    ];
    const client = makeClient({ bookings, names: { [C1]: "Sarah" } });

    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.ok(slot);
    assert.equal(slot.carerId, C1);
    assert.equal(slot.carerName, "Sarah");
    assert.equal(slot.serviceType, "childcare");
    assert.equal(slot.dayOfWeek, 2); // Tuesday
    assert.equal(slot.startHour, 9);
    assert.equal(slot.occurrences, 2);
    assert.equal(slot.lastBookingId, "b1"); // most recent
  });

  it("returns null when there is no qualifying history", async () => {
    const client = makeClient({ bookings: [] });
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.equal(slot, null);
  });

  it("returns null when no group reaches 2 occurrences", async () => {
    // Three bookings, all distinct slots.
    const bookings: BookingRow[] = [
      { id: "b1", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" },
      { id: "b2", caregiver_id: C1, service_type: "elderly", starts_at: "2026-06-02T11:00:00Z" },
      { id: "b3", caregiver_id: C2, service_type: "childcare", starts_at: "2026-05-30T14:00:00Z" },
    ];
    const client = makeClient({ bookings, names: { [C1]: "Sarah" } });
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.equal(slot, null);
  });

  it("tie-break: when two groups have equal occurrences, most recent booking wins", async () => {
    // Group A (C1 Tue 09:00) and group B (C2 Wed 10:00) each have 2 bookings.
    // Group B's most recent (b-b1) is newer than group A's most recent (b-a1).
    const bookings: BookingRow[] = [
      { id: "b-b1", caregiver_id: C2, service_type: "elderly", starts_at: "2026-06-10T10:00:00Z" }, // Wed
      { id: "b-a1", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" }, // Tue
      { id: "b-b2", caregiver_id: C2, service_type: "elderly", starts_at: "2026-06-03T10:00:00Z" }, // Wed
      { id: "b-a2", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-02T09:00:00Z" }, // Tue
    ];
    const client = makeClient({
      bookings,
      names: { [C1]: "Sarah", [C2]: "Ben" },
    });
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.ok(slot);
    assert.equal(slot.carerId, C2);
    assert.equal(slot.carerName, "Ben");
    assert.equal(slot.dayOfWeek, 3); // Wednesday
    assert.equal(slot.lastBookingId, "b-b1");
  });

  it("prefers the higher-occurrence group over a more recent smaller group", async () => {
    const bookings: BookingRow[] = [
      // C2 single, most recent
      { id: "b-b1", caregiver_id: C2, service_type: "elderly", starts_at: "2026-06-12T10:00:00Z" },
      // C1 Tue 09:00 x3
      { id: "b-a1", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" },
      { id: "b-a2", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-02T09:00:00Z" },
      { id: "b-a3", caregiver_id: C1, service_type: "childcare", starts_at: "2026-05-26T09:00:00Z" },
    ];
    const client = makeClient({ bookings, names: { [C1]: "Sarah" } });
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.ok(slot);
    assert.equal(slot.carerId, C1);
    assert.equal(slot.occurrences, 3);
    assert.equal(slot.lastBookingId, "b-a1");
  });

  it("falls back to a generic carer name when no profile row exists", async () => {
    const bookings: BookingRow[] = [
      { id: "b1", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" },
      { id: "b2", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-02T09:00:00Z" },
    ];
    const client = makeClient({ bookings }); // no names
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.ok(slot);
    assert.equal(slot.carerName, "your carer");
  });

  it("returns null on a bookings db error", async () => {
    const client = makeClient({
      bookings: [],
      bookingsError: { message: "boom" },
    });
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.equal(slot, null);
  });

  it("ignores rows with null caregiver_id / service_type / starts_at", async () => {
    const bookings: BookingRow[] = [
      { id: "n1", caregiver_id: null, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" },
      { id: "n2", caregiver_id: C1, service_type: null, starts_at: "2026-06-09T09:00:00Z" },
      { id: "n3", caregiver_id: C1, service_type: "childcare", starts_at: null },
      { id: "b1", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-09T09:00:00Z" },
      { id: "b2", caregiver_id: C1, service_type: "childcare", starts_at: "2026-06-02T09:00:00Z" },
    ];
    const client = makeClient({ bookings, names: { [C1]: "Sarah" } });
    const slot = await detectUsualSlot({ seekerId: SEEKER, client, now: NOW });
    assert.ok(slot);
    assert.equal(slot.occurrences, 2);
  });
});

/**
 * Tests for the GET /api/m/carers/recent handler.
 *
 * Drives the pure handler with a stubbed Supabase client to avoid pulling
 * in next/headers + cookie machinery (matches the pattern in
 * src/app/api/m/push/register/route.test.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleRecentCarers,
  parseLimit,
  type RecentCarersClient,
  type ApiRecentCarersResponse,
} from "@/lib/carers/recent-handler";

type BookingRow = {
  caregiver_id: string | null;
  starts_at: string | null;
  service_type: string | null;
};

type CaregiverProfileRow = {
  user_id: string;
  display_name: string | null;
  photo_url: string | null;
  headline: string | null;
  services: string[] | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type BookingsCall = {
  seeker_id: string;
  statuses: readonly string[];
  ascending: boolean;
  limit: number;
};

function makeClient(opts: {
  bookings: BookingRow[];
  caregiverProfiles?: CaregiverProfileRow[];
  profiles?: ProfileRow[];
  bookingsError?: { message: string } | null;
  caregiverError?: { message: string } | null;
  profilesError?: { message: string } | null;
  bookingsCalls?: BookingsCall[];
}): RecentCarersClient {
  const cgRows = opts.caregiverProfiles ?? [];
  const profRows = opts.profiles ?? [];
  return {
    from(table: "bookings" | "caregiver_profiles" | "profiles") {
      if (table === "bookings") {
        return {
          select() {
            return {
              eq(_col: "seeker_id", seekerId: string) {
                return {
                  in(_col2: "status", statuses: readonly string[]) {
                    return {
                      order(
                        _col3: "starts_at",
                        ordOpts: { ascending: boolean },
                      ) {
                        return {
                          async limit(n: number) {
                            opts.bookingsCalls?.push({
                              seeker_id: seekerId,
                              statuses,
                              ascending: ordOpts.ascending,
                              limit: n,
                            });
                            if (opts.bookingsError) {
                              return {
                                data: null,
                                error: opts.bookingsError,
                              };
                            }
                            return {
                              data: opts.bookings,
                              error: null,
                            };
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
              async in(_col: "user_id", ids: string[]) {
                if (opts.caregiverError) {
                  return { data: null, error: opts.caregiverError };
                }
                return {
                  data: cgRows.filter((r) => ids.includes(r.user_id)),
                  error: null,
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
            async in(_col: "id", ids: string[]) {
              if (opts.profilesError) {
                return { data: null, error: opts.profilesError };
              }
              return {
                data: profRows.filter((r) => ids.includes(r.id)),
                error: null,
              };
            },
          };
        },
      };
    },
  } as unknown as RecentCarersClient;
}

const SEEKER = "11111111-2222-3333-4444-555555555555";
const C1 = "aaaaaaaa-0000-0000-0000-000000000001";
const C2 = "aaaaaaaa-0000-0000-0000-000000000002";
const C3 = "aaaaaaaa-0000-0000-0000-000000000003";
const C4 = "aaaaaaaa-0000-0000-0000-000000000004";
const C5 = "aaaaaaaa-0000-0000-0000-000000000005";

describe("parseLimit", () => {
  it("defaults to 4 when missing", () => {
    assert.equal(parseLimit(null), 4);
  });

  it("clamps to max 8", () => {
    assert.equal(parseLimit("100"), 8);
  });

  it("falls back to default when not a number", () => {
    assert.equal(parseLimit("banana"), 4);
  });

  it("falls back to default when non-positive", () => {
    assert.equal(parseLimit("0"), 4);
    assert.equal(parseLimit("-3"), 4);
  });

  it("accepts a valid in-range value", () => {
    assert.equal(parseLimit("3"), 3);
  });
});

describe("handleRecentCarers", () => {
  it("returns 5 distinct recent carers capped to limit=4", async () => {
    const bookings: BookingRow[] = [
      { caregiver_id: C1, starts_at: "2026-05-20T10:00:00Z", service_type: "childcare" },
      { caregiver_id: C2, starts_at: "2026-05-19T10:00:00Z", service_type: "elderly" },
      { caregiver_id: C3, starts_at: "2026-05-18T10:00:00Z", service_type: "home_support" },
      { caregiver_id: C4, starts_at: "2026-05-17T10:00:00Z", service_type: "childcare" },
      { caregiver_id: C5, starts_at: "2026-05-16T10:00:00Z", service_type: "elderly" },
    ];
    const caregiverProfiles: CaregiverProfileRow[] = [
      { user_id: C1, display_name: "Anna", photo_url: "a.jpg", headline: null, services: ["childcare"] },
      { user_id: C2, display_name: "Ben", photo_url: null, headline: "Friendly", services: ["elderly"] },
      { user_id: C3, display_name: "Cara", photo_url: "c.jpg", headline: null, services: ["home_support"] },
      { user_id: C4, display_name: "Dan", photo_url: null, headline: null, services: [] },
      { user_id: C5, display_name: "Eve", photo_url: null, headline: null, services: [] },
    ];
    const bookingsCalls: BookingsCall[] = [];
    const client = makeClient({ bookings, caregiverProfiles, bookingsCalls });

    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ApiRecentCarersResponse;
    assert.equal(json.carers.length, 4);
    assert.deepEqual(
      json.carers.map((c) => c.id),
      [C1, C2, C3, C4],
    );
    // Pulled by seeker_id, filtered to rebookable statuses, ordered DESC
    assert.equal(bookingsCalls.length, 1);
    assert.equal(bookingsCalls[0].seeker_id, SEEKER);
    assert.deepEqual(
      [...bookingsCalls[0].statuses].sort(),
      ["accepted", "completed", "in_progress"],
    );
    assert.equal(bookingsCalls[0].ascending, false);
  });

  it("dedupes — a seeker who booked the same carer 3 times sees them once", async () => {
    const bookings: BookingRow[] = [
      { caregiver_id: C1, starts_at: "2026-05-20T10:00:00Z", service_type: "childcare" },
      { caregiver_id: C1, starts_at: "2026-05-15T10:00:00Z", service_type: "childcare" },
      { caregiver_id: C1, starts_at: "2026-05-10T10:00:00Z", service_type: "childcare" },
      { caregiver_id: C2, starts_at: "2026-05-08T10:00:00Z", service_type: "elderly" },
    ];
    const caregiverProfiles: CaregiverProfileRow[] = [
      { user_id: C1, display_name: "Anna", photo_url: null, headline: null, services: ["childcare"] },
      { user_id: C2, display_name: "Ben", photo_url: null, headline: null, services: ["elderly"] },
    ];
    const client = makeClient({ bookings, caregiverProfiles });

    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ApiRecentCarersResponse;
    assert.equal(json.carers.length, 2);
    assert.equal(json.carers[0].id, C1);
    // last_booked_at is the most recent of the three C1 bookings
    assert.equal(json.carers[0].last_booked_at, "2026-05-20T10:00:00Z");
    assert.equal(json.carers[1].id, C2);
  });

  it("sorts by most recent booking DESC", async () => {
    // Provide in DESC order (this is what the DB would return given
    // .order('starts_at', { ascending: false })).
    const bookings: BookingRow[] = [
      { caregiver_id: C3, starts_at: "2026-05-22T10:00:00Z", service_type: "elderly" },
      { caregiver_id: C1, starts_at: "2026-05-21T10:00:00Z", service_type: "childcare" },
      { caregiver_id: C2, starts_at: "2026-05-20T10:00:00Z", service_type: "home_support" },
    ];
    const caregiverProfiles: CaregiverProfileRow[] = [
      { user_id: C1, display_name: "Anna", photo_url: null, headline: null, services: [] },
      { user_id: C2, display_name: "Ben", photo_url: null, headline: null, services: [] },
      { user_id: C3, display_name: "Cara", photo_url: null, headline: null, services: [] },
    ];
    const client = makeClient({ bookings, caregiverProfiles });

    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    const json = (await res.json()) as ApiRecentCarersResponse;
    assert.deepEqual(
      json.carers.map((c) => c.id),
      [C3, C1, C2],
    );
    assert.deepEqual(
      json.carers.map((c) => c.last_booked_at),
      [
        "2026-05-22T10:00:00Z",
        "2026-05-21T10:00:00Z",
        "2026-05-20T10:00:00Z",
      ],
    );
  });

  it("empty bookings → empty carers array", async () => {
    const client = makeClient({ bookings: [] });
    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ApiRecentCarersResponse;
    assert.deepEqual(json.carers, []);
  });

  it("falls back to profiles.full_name + avatar_url when caregiver_profiles row is missing", async () => {
    const bookings: BookingRow[] = [
      { caregiver_id: C1, starts_at: "2026-05-20T10:00:00Z", service_type: "childcare" },
    ];
    const profiles: ProfileRow[] = [
      { id: C1, full_name: "Fallback Name", avatar_url: "fallback.jpg" },
    ];
    const client = makeClient({ bookings, caregiverProfiles: [], profiles });

    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    const json = (await res.json()) as ApiRecentCarersResponse;
    assert.equal(json.carers.length, 1);
    assert.equal(json.carers[0].name, "Fallback Name");
    assert.equal(json.carers[0].avatar_url, "fallback.jpg");
    assert.equal(json.carers[0].service, "childcare");
  });

  it("bookings db error → 500", async () => {
    const client = makeClient({
      bookings: [],
      bookingsError: { message: "boom" },
    });
    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    assert.equal(res.status, 500);
  });

  it("ignores rows with null caregiver_id or starts_at", async () => {
    const bookings: BookingRow[] = [
      { caregiver_id: null, starts_at: "2026-05-22T10:00:00Z", service_type: null },
      { caregiver_id: C1, starts_at: null, service_type: "childcare" },
      { caregiver_id: C2, starts_at: "2026-05-20T10:00:00Z", service_type: "elderly" },
    ];
    const caregiverProfiles: CaregiverProfileRow[] = [
      { user_id: C2, display_name: "Ben", photo_url: null, headline: null, services: [] },
    ];
    const client = makeClient({ bookings, caregiverProfiles });
    const res = await handleRecentCarers({
      seeker_id: SEEKER,
      client,
      limit: 4,
    });
    const json = (await res.json()) as ApiRecentCarersResponse;
    assert.equal(json.carers.length, 1);
    assert.equal(json.carers[0].id, C2);
  });
});

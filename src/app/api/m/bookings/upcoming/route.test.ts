/**
 * Tests for the upcoming-bookings handler.
 *
 * Drives the pure handler with a stubbed Supabase client to avoid pulling
 * in next/headers + cookie machinery (same pattern as the register-handler
 * tests). We script:
 *   - a row set per (caller, status, starts_at) filter
 *   - a `caregiver_profiles` / `profiles` batch lookup
 * and assert the handler:
 *   - 401s when unauthenticated (route-level; modelled by handler input)
 *   - caps to `limit` rows
 *   - returns sorted ASC by starts_at
 *   - excludes past bookings
 *   - excludes cancelled / completed / refunded / paid_out / disputed rows
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleUpcoming,
  parseLimit,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  UPCOMING_STATUSES,
  type ApiUpcomingBookingsResponse,
  type UpcomingBookingRow,
  type UpcomingQueryClient,
} from "@/lib/bookings/upcoming-handler";

type Row = UpcomingBookingRow & { seeker_id: string };

const SEEKER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-9999-9999-9999-999999999999";
const NOW = new Date("2026-05-25T12:00:00.000Z");

function mkBooking(p: {
  id: string;
  seeker_id?: string;
  status?: string;
  starts_at: string;
  caregiver_id?: string | null;
}): Row {
  return {
    id: p.id,
    seeker_id: p.seeker_id ?? SEEKER,
    status: p.status ?? "accepted",
    starts_at: p.starts_at,
    ends_at: new Date(
      new Date(p.starts_at).getTime() + 60 * 60 * 1000,
    ).toISOString(),
    caregiver_id: p.caregiver_id === undefined ? "carer-1" : p.caregiver_id,
    service_type: "childcare",
    location_city: "London",
    location_country: "GB",
  };
}

function makeClient(opts: {
  rows: Row[];
  callerId: string;
  carers?: { user_id: string; display_name: string | null; photo_url: string | null }[];
  profiles?: { id: string; full_name: string | null; avatar_url: string | null }[];
  bookingsError?: { message: string } | null;
  carersError?: { message: string } | null;
  profilesError?: { message: string } | null;
}): UpcomingQueryClient {
  return {
    from() {
      return {
        select() {
          return {
            eq(_col, seekerId) {
              return {
                in(_col2, statuses) {
                  return {
                    gt(_col3, nowIso) {
                      return {
                        order(_col4, { ascending }) {
                          return {
                            async limit(n) {
                              if (opts.bookingsError) {
                                return { data: null, error: opts.bookingsError };
                              }
                              let visible = opts.rows.filter(
                                (r) =>
                                  r.seeker_id === seekerId &&
                                  r.seeker_id === opts.callerId &&
                                  (statuses as string[]).includes(r.status) &&
                                  (r.starts_at ?? "") > nowIso,
                              );
                              visible.sort((a, b) => {
                                const av = a.starts_at ?? "";
                                const bv = b.starts_at ?? "";
                                return ascending
                                  ? av.localeCompare(bv)
                                  : bv.localeCompare(av);
                              });
                              return {
                                data: visible.slice(0, n),
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
        },
      };
    },
    from2: {
      async caregiver_profiles(ids) {
        if (opts.carersError) return { data: null, error: opts.carersError };
        const data = (opts.carers ?? []).filter((c) => ids.includes(c.user_id));
        return { data, error: null };
      },
      async profiles(ids) {
        if (opts.profilesError) return { data: null, error: opts.profilesError };
        const data = (opts.profiles ?? []).filter((p) => ids.includes(p.id));
        return { data, error: null };
      },
    },
  } satisfies UpcomingQueryClient;
}

describe("parseLimit", () => {
  it("defaults to 3 when missing", () => {
    assert.equal(parseLimit(null), DEFAULT_LIMIT);
    assert.equal(DEFAULT_LIMIT, 3);
  });

  it("caps at MAX_LIMIT (20)", () => {
    assert.equal(parseLimit("999"), MAX_LIMIT);
  });

  it("ignores garbage / non-positive values → default", () => {
    assert.equal(parseLimit("not-a-number"), DEFAULT_LIMIT);
    assert.equal(parseLimit("0"), DEFAULT_LIMIT);
    assert.equal(parseLimit("-5"), DEFAULT_LIMIT);
  });

  it("accepts valid values", () => {
    assert.equal(parseLimit("5"), 5);
    assert.equal(parseLimit("1"), 1);
  });
});

describe("handleUpcoming", () => {
  it("limits to the requested count (5 upcoming, limit=3 → 3)", async () => {
    const rows = [
      mkBooking({ id: "b1", starts_at: "2026-05-26T10:00:00Z" }),
      mkBooking({ id: "b2", starts_at: "2026-05-27T10:00:00Z" }),
      mkBooking({ id: "b3", starts_at: "2026-05-28T10:00:00Z" }),
      mkBooking({ id: "b4", starts_at: "2026-05-29T10:00:00Z" }),
      mkBooking({ id: "b5", starts_at: "2026-05-30T10:00:00Z" }),
    ];
    const client = makeClient({ rows, callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 3,
      now: NOW,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.equal(json.bookings.length, 3);
    assert.deepEqual(
      json.bookings.map((b) => b.id),
      ["b1", "b2", "b3"],
    );
  });

  it("returns bookings sorted by starts_at ASC", async () => {
    const rows = [
      mkBooking({ id: "late", starts_at: "2026-06-01T10:00:00Z" }),
      mkBooking({ id: "early", starts_at: "2026-05-26T10:00:00Z" }),
      mkBooking({ id: "mid", starts_at: "2026-05-28T10:00:00Z" }),
    ];
    const client = makeClient({ rows, callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 5,
      now: NOW,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.deepEqual(
      json.bookings.map((b) => b.id),
      ["early", "mid", "late"],
    );
  });

  it("excludes past bookings (starts_at <= now)", async () => {
    const rows = [
      mkBooking({ id: "past1", starts_at: "2026-05-24T10:00:00Z" }),
      mkBooking({ id: "past2", starts_at: "2026-01-01T10:00:00Z" }),
      mkBooking({ id: "future", starts_at: "2026-05-26T10:00:00Z" }),
    ];
    const client = makeClient({ rows, callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 5,
      now: NOW,
    });
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.equal(json.bookings.length, 1);
    assert.equal(json.bookings[0].id, "future");
  });

  it("excludes cancelled / completed / refunded / paid_out / disputed", async () => {
    const rows = [
      mkBooking({
        id: "cancelled",
        status: "cancelled",
        starts_at: "2026-05-26T10:00:00Z",
      }),
      mkBooking({
        id: "completed",
        status: "completed",
        starts_at: "2026-05-26T11:00:00Z",
      }),
      mkBooking({
        id: "refunded",
        status: "refunded",
        starts_at: "2026-05-26T12:00:00Z",
      }),
      mkBooking({
        id: "paid_out",
        status: "paid_out",
        starts_at: "2026-05-26T13:00:00Z",
      }),
      mkBooking({
        id: "disputed",
        status: "disputed",
        starts_at: "2026-05-26T14:00:00Z",
      }),
      mkBooking({
        id: "good_accepted",
        status: "accepted",
        starts_at: "2026-05-26T15:00:00Z",
      }),
      mkBooking({
        id: "good_pending",
        status: "pending",
        starts_at: "2026-05-26T16:00:00Z",
      }),
    ];
    const client = makeClient({ rows, callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 10,
      now: NOW,
    });
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.deepEqual(
      json.bookings.map((b) => b.id).sort(),
      ["good_accepted", "good_pending"].sort(),
    );
  });

  it("does not leak rows owned by another seeker (RLS-equivalent)", async () => {
    const rows = [
      mkBooking({
        id: "mine",
        seeker_id: SEEKER,
        starts_at: "2026-05-26T10:00:00Z",
      }),
      mkBooking({
        id: "theirs",
        seeker_id: OTHER,
        starts_at: "2026-05-26T11:00:00Z",
      }),
    ];
    const client = makeClient({ rows, callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 5,
      now: NOW,
    });
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.deepEqual(
      json.bookings.map((b) => b.id),
      ["mine"],
    );
  });

  it("returns empty list when no upcoming bookings exist", async () => {
    const client = makeClient({ rows: [], callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 3,
      now: NOW,
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.deepEqual(json.bookings, []);
  });

  it("joins caregiver display_name + avatar in one batch (no N+1)", async () => {
    const rows = [
      mkBooking({
        id: "b1",
        caregiver_id: "carer-aisha",
        starts_at: "2026-05-26T10:00:00Z",
      }),
      mkBooking({
        id: "b2",
        caregiver_id: "carer-marvin",
        starts_at: "2026-05-27T10:00:00Z",
      }),
      mkBooking({
        id: "b3",
        caregiver_id: "carer-aisha",
        starts_at: "2026-05-28T10:00:00Z",
      }),
    ];
    let carerCalls = 0;
    let profileCalls = 0;
    const client: UpcomingQueryClient = {
      ...makeClient({
        rows,
        callerId: SEEKER,
        carers: [
          {
            user_id: "carer-aisha",
            display_name: "Aisha P.",
            photo_url: "https://img/aisha.jpg",
          },
          {
            user_id: "carer-marvin",
            display_name: "Marvin M.",
            photo_url: null,
          },
        ],
        profiles: [
          {
            id: "carer-aisha",
            full_name: "Aisha Patel",
            avatar_url: "https://img/aisha-prof.jpg",
          },
          {
            id: "carer-marvin",
            full_name: "Marvin McKinney",
            avatar_url: null,
          },
        ],
      }),
      from2: {
        async caregiver_profiles(ids) {
          carerCalls++;
          // The handler should batch all distinct ids into ONE call.
          assert.deepEqual(ids.slice().sort(), ["carer-aisha", "carer-marvin"]);
          return {
            data: [
              {
                user_id: "carer-aisha",
                display_name: "Aisha P.",
                photo_url: "https://img/aisha.jpg",
              },
              {
                user_id: "carer-marvin",
                display_name: "Marvin M.",
                photo_url: null,
              },
            ],
            error: null,
          };
        },
        async profiles(ids) {
          profileCalls++;
          assert.deepEqual(ids.slice().sort(), ["carer-aisha", "carer-marvin"]);
          return {
            data: [
              {
                id: "carer-aisha",
                full_name: "Aisha Patel",
                avatar_url: "https://img/aisha-prof.jpg",
              },
              {
                id: "carer-marvin",
                full_name: "Marvin McKinney",
                avatar_url: null,
              },
            ],
            error: null,
          };
        },
      },
    };

    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 5,
      now: NOW,
    });
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.equal(json.bookings.length, 3);
    assert.equal(carerCalls, 1);
    assert.equal(profileCalls, 1);
    assert.equal(json.bookings[0].caregiver?.display_name, "Aisha P.");
    assert.equal(json.bookings[0].caregiver?.full_name, "Aisha Patel");
    assert.equal(json.bookings[1].caregiver?.display_name, "Marvin M.");
  });

  it("handles bookings with no caregiver assigned (returns caregiver:null)", async () => {
    const rows = [
      mkBooking({
        id: "open",
        caregiver_id: null,
        starts_at: "2026-05-26T10:00:00Z",
      }),
    ];
    const client = makeClient({ rows, callerId: SEEKER });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 5,
      now: NOW,
    });
    const json = (await res.json()) as ApiUpcomingBookingsResponse;
    assert.equal(json.bookings.length, 1);
    assert.equal(json.bookings[0].caregiver, null);
  });

  it("propagates a DB error as 500", async () => {
    const client = makeClient({
      rows: [],
      callerId: SEEKER,
      bookingsError: { message: "boom" },
    });
    const res = await handleUpcoming({
      user_id: SEEKER,
      client,
      limit: 3,
      now: NOW,
    });
    assert.equal(res.status, 500);
  });

  it("UPCOMING_STATUSES reflects the active-booking set we want to surface", () => {
    assert.deepEqual(UPCOMING_STATUSES.slice().sort(), [
      "accepted",
      "in_progress",
      "paid",
      "pending",
    ]);
  });
});

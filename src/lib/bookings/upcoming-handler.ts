/**
 * Pure handler for GET /api/m/bookings/upcoming.
 *
 * Split from the route file so unit tests can drive the query logic with a
 * stubbed Supabase client — same pattern as src/lib/push/register-handler.ts
 * and src/lib/admin/training-handlers.ts. The route file wires up auth and
 * the real supabase server client.
 *
 * Returns the signed-in seeker's next-N upcoming bookings: future start time,
 * still in an active status (pending, accepted, paid, in_progress), ordered
 * by starts_at ASC. Counterparty caregiver display name / avatar are joined
 * in a single batched lookup to keep this to one logical "row fetch + one
 * profiles fetch" — no N+1.
 */
import { NextResponse } from "next/server";

export const DEFAULT_LIMIT = 3;
export const MAX_LIMIT = 20;

/**
 * Statuses that count as "upcoming" — anything not cancelled / refunded /
 * completed / paid_out / disputed. Mirrors the enum in
 * supabase/migrations/20260502_stripe_connect.sql.
 */
export const UPCOMING_STATUSES: ReadonlyArray<string> = [
  "pending",
  "accepted",
  "paid",
  "in_progress",
];

export type UpcomingBookingRow = {
  id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  caregiver_id: string | null;
  service_type: string | null;
  location_city: string | null;
  location_country: string | null;
};

export type CarerProfileRow = {
  user_id: string;
  display_name: string | null;
  photo_url: string | null;
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

/**
 * Minimal interface of the Supabase client we touch. Mirrors the shape
 * returned by createClient() (server) so tests can stub it without pulling
 * in the full @supabase/supabase-js types.
 */
export type UpcomingQueryClient = {
  from(table: "bookings"): {
    select(cols: string): {
      eq(col: "seeker_id", value: string): {
        in(col: "status", values: ReadonlyArray<string>): {
          gt(col: "starts_at", value: string): {
            order(
              col: "starts_at",
              opts: { ascending: boolean },
            ): {
              limit(n: number): Promise<{
                data: UpcomingBookingRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
  // Used for the carer / profile batch fetches.
  from2: {
    caregiver_profiles(ids: ReadonlyArray<string>): Promise<{
      data: CarerProfileRow[] | null;
      error: { message: string } | null;
    }>;
    profiles(ids: ReadonlyArray<string>): Promise<{
      data: ProfileRow[] | null;
      error: { message: string } | null;
    }>;
  };
};

export type ApiUpcomingBooking = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  service_type: string;
  location_city: string | null;
  location_country: string | null;
  caregiver: {
    user_id: string;
    display_name: string | null;
    full_name: string | null;
    avatar_url: string | null;
    photo_url: string | null;
  } | null;
};

export type ApiUpcomingBookingsResponse = {
  bookings: ApiUpcomingBooking[];
};

export function parseLimit(raw: string | null): number {
  if (raw == null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export async function handleUpcoming(args: {
  user_id: string;
  client: UpcomingQueryClient;
  limit: number;
  now?: Date;
}): Promise<NextResponse> {
  const { user_id, client, limit } = args;
  const nowIso = (args.now ?? new Date()).toISOString();

  const { data: rows, error } = await client
    .from("bookings")
    .select(
      "id, status, starts_at, ends_at, caregiver_id, service_type, location_city, location_country",
    )
    .eq("seeker_id", user_id)
    .in("status", UPCOMING_STATUSES)
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as UpcomingBookingRow[];
  if (list.length === 0) {
    const empty: ApiUpcomingBookingsResponse = { bookings: [] };
    return NextResponse.json(empty);
  }

  const carerIds = Array.from(
    new Set(
      list
        .map((b) => b.caregiver_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  let carerProfiles = new Map<string, CarerProfileRow>();
  let profileById = new Map<string, ProfileRow>();
  if (carerIds.length > 0) {
    const [carersRes, profsRes] = await Promise.all([
      client.from2.caregiver_profiles(carerIds),
      client.from2.profiles(carerIds),
    ]);
    if (carersRes.error) {
      return NextResponse.json(
        { error: carersRes.error.message },
        { status: 500 },
      );
    }
    if (profsRes.error) {
      return NextResponse.json(
        { error: profsRes.error.message },
        { status: 500 },
      );
    }
    carerProfiles = new Map(
      (carersRes.data ?? []).map((c) => [c.user_id, c]),
    );
    profileById = new Map((profsRes.data ?? []).map((p) => [p.id, p]));
  }

  const bookings: ApiUpcomingBooking[] = list.map((b) => {
    const carer = b.caregiver_id
      ? carerProfiles.get(b.caregiver_id) ?? null
      : null;
    const prof = b.caregiver_id
      ? profileById.get(b.caregiver_id) ?? null
      : null;
    return {
      id: b.id,
      status: b.status,
      starts_at: b.starts_at ?? "",
      ends_at: b.ends_at ?? "",
      service_type: b.service_type ?? "",
      location_city: b.location_city,
      location_country: b.location_country,
      caregiver: b.caregiver_id
        ? {
            user_id: b.caregiver_id,
            display_name: carer?.display_name ?? null,
            full_name: prof?.full_name ?? null,
            avatar_url: prof?.avatar_url ?? null,
            photo_url: carer?.photo_url ?? null,
          }
        : null,
    };
  });

  const response: ApiUpcomingBookingsResponse = { bookings };
  return NextResponse.json(response);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One booking summary as returned by /api/m/bookings.
 * `as_role` tells the client whether the signed-in user is the seeker
 * or the carer on this booking — used to pick which counterparty
 * profile to render.
 */
export type ApiBookingListItem = {
  id: string;
  status: string;
  as_role: "seeker" | "carer";
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  total_cents: number;
  currency: "gbp" | "usd";
  service_type: string;
  location_city: string | null;
  location_country: string | null;
  notes: string | null;
  counterparty: {
    user_id: string;
    display_name: string | null;
    full_name: string | null;
    avatar_url: string | null;
    photo_url: string | null;
    city: string | null;
    country: string | null;
  };
  created_at: string;
};

export type ApiBookingsListResponse = {
  bookings: ApiBookingListItem[];
};

type BookingRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  hours: number | null;
  hourly_rate_cents: number | null;
  total_cents: number | null;
  currency: string | null;
  service_type: string | null;
  location_city: string | null;
  location_country: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * GET /api/m/bookings
 * Returns the signed-in user's bookings (as seeker or carer), newest
 * first, plus a counterparty profile snapshot for each row so the
 * list can render without N round-trips.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Pull both seeker-side and carer-side bookings in one OR-filter call.
  // RLS already gates visibility; the explicit `.or` keeps the planner
  // happy and avoids two round-trips.
  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, hourly_rate_cents, total_cents, currency, service_type, location_city, location_country, notes, created_at",
    )
    .or(`seeker_id.eq.${user.id},caregiver_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const list = (rows ?? []) as BookingRow[];
  if (list.length === 0) {
    const empty: ApiBookingsListResponse = { bookings: [] };
    return NextResponse.json(empty);
  }

  // Resolve counterparty profiles in one batch each.
  const counterpartyIds = Array.from(
    new Set(
      list.map((b) =>
        b.seeker_id === user.id ? b.caregiver_id : b.seeker_id,
      ),
    ),
  ).filter((id): id is string => typeof id === "string" && id.length > 0);

  let carerProfiles = new Map<
    string,
    {
      display_name: string | null;
      photo_url: string | null;
      city: string | null;
      country: string | null;
    }
  >();
  let profileById = new Map<
    string,
    { full_name: string | null; avatar_url: string | null }
  >();

  if (counterpartyIds.length > 0) {
    const [{ data: carers }, { data: profs }] = await Promise.all([
      supabase
        .from("caregiver_profiles")
        .select("user_id, display_name, photo_url, city, country")
        .in("user_id", counterpartyIds),
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", counterpartyIds),
    ]);
    carerProfiles = new Map(
      ((carers ?? []) as {
        user_id: string;
        display_name: string | null;
        photo_url: string | null;
        city: string | null;
        country: string | null;
      }[]).map((c) => [
        c.user_id,
        {
          display_name: c.display_name,
          photo_url: c.photo_url,
          city: c.city,
          country: c.country,
        },
      ]),
    );
    profileById = new Map(
      ((profs ?? []) as {
        id: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]).map((p) => [
        p.id,
        { full_name: p.full_name, avatar_url: p.avatar_url },
      ]),
    );
  }

  const bookings: ApiBookingListItem[] = list.map((b) => {
    const isSeeker = b.seeker_id === user.id;
    const counterId = isSeeker ? b.caregiver_id : b.seeker_id;
    const carer = counterId ? carerProfiles.get(counterId) ?? null : null;
    const prof = counterId ? profileById.get(counterId) ?? null : null;
    const cur = (b.currency ?? "gbp").toLowerCase();
    const currency: "gbp" | "usd" = cur === "usd" ? "usd" : "gbp";
    return {
      id: b.id,
      status: b.status,
      as_role: isSeeker ? "seeker" : "carer",
      starts_at: b.starts_at ?? "",
      ends_at: b.ends_at ?? "",
      hours: Number(b.hours ?? 0),
      hourly_rate_cents: Number(b.hourly_rate_cents ?? 0),
      total_cents: Number(b.total_cents ?? 0),
      currency,
      service_type: b.service_type ?? "",
      location_city: b.location_city,
      location_country: b.location_country,
      notes: b.notes,
      counterparty: {
        user_id: counterId ?? "",
        display_name: carer?.display_name ?? null,
        full_name: prof?.full_name ?? null,
        avatar_url: prof?.avatar_url ?? null,
        photo_url: carer?.photo_url ?? null,
        city: carer?.city ?? null,
        country: carer?.country ?? null,
      },
      created_at: b.created_at,
    };
  });

  const response: ApiBookingsListResponse = { bookings };
  return NextResponse.json(response);
}

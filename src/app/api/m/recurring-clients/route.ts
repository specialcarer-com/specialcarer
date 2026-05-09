import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type RecurringClient = {
  client_id: string;
  client_type: "org" | "private";
  /** service_user name (org) or seeker display name (private) */
  display_name: string | null;
  next_visit: string | null; // ISO timestamptz
  visit_count: number;
  next_4_visits: string[]; // ISO timestamptz[]
  /** parent_booking_id if it's a series */
  series_id: string | null;
};

/**
 * GET /api/m/recurring-clients
 * Returns upcoming bookings grouped as recurring clients for the signed-in carer.
 * Groups:
 *  - org bookings  → grouped by service_user_id
 *  - private       → grouped by seeker_id
 * Uses parent_booking_id to identify recurring series.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  // Fetch all future bookings for this carer
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      `id, seeker_id, service_user_id, organization_id, starts_at, ends_at,
       booking_source, parent_booking_id, status`
    )
    .eq("caregiver_id", user.id)
    .in("status", ["pending", "accepted", "paid", "pending_offer", "offered"])
    .gte("starts_at", now)
    .order("starts_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ clients: [] });
  }

  // Group bookings
  const groups = new Map<
    string,
    {
      client_id: string;
      client_type: "org" | "private";
      series_id: string | null;
      visits: string[];
    }
  >();

  for (const b of bookings) {
    const isOrg = b.booking_source === "org" && b.service_user_id;
    const key = isOrg ? `org:${b.service_user_id}` : `private:${b.seeker_id}`;

    if (!groups.has(key)) {
      groups.set(key, {
        client_id: isOrg ? b.service_user_id : b.seeker_id,
        client_type: isOrg ? "org" : "private",
        series_id: b.parent_booking_id ?? null,
        visits: [],
      });
    }
    const g = groups.get(key)!;
    g.visits.push(b.starts_at);
    // Update series_id if not set
    if (!g.series_id && b.parent_booking_id) g.series_id = b.parent_booking_id;
  }

  // Fetch display names for org service_users and private seekers
  const orgClientIds = [...groups.values()]
    .filter((g) => g.client_type === "org")
    .map((g) => g.client_id)
    .filter(Boolean);
  const privateClientIds = [...groups.values()]
    .filter((g) => g.client_type === "private")
    .map((g) => g.client_id)
    .filter(Boolean);

  const nameMap = new Map<string, string>();

  if (orgClientIds.length > 0) {
    const { data: serviceUsers } = await supabase
      .from("service_users")
      .select("id, full_name")
      .in("id", orgClientIds);
    for (const su of serviceUsers ?? []) {
      nameMap.set(su.id, su.full_name);
    }
  }

  if (privateClientIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", privateClientIds);
    for (const p of profiles ?? []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
      if (name) nameMap.set(p.id, name);
    }
  }

  const clients: RecurringClient[] = [...groups.values()].map((g) => ({
    client_id: g.client_id,
    client_type: g.client_type,
    display_name: nameMap.get(g.client_id) ?? null,
    next_visit: g.visits[0] ?? null,
    visit_count: g.visits.length,
    next_4_visits: g.visits.slice(0, 4),
    series_id: g.series_id,
  }));

  // Sort by next_visit asc
  clients.sort((a, b) => {
    if (!a.next_visit) return 1;
    if (!b.next_visit) return -1;
    return a.next_visit.localeCompare(b.next_visit);
  });

  return NextResponse.json({ clients });
}

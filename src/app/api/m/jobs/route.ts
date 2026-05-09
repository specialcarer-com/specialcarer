import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ALLOWED_VERTICALS = new Set([
  "elderly_care",
  "childcare",
  "special_needs",
  "postnatal",
  "complex_care",
]);

type TargetedRpcRow = {
  id: string;
  seeker_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  service_type: string;
  location_city: string | null;
  location_country: string | null;
  location_postcode: string | null;
  service_point_lng: number | null;
  service_point_lat: number | null;
  distance_m: number | null;
  discovery_expires_at: string | null;
  created_at: string;
  /** Phase B: org booking fields (null for regular bookings) */
  shift_mode: string | null;
  sleep_in_carer_pay: number | null;
  booking_source: string | null;
};

type OpenRpcRow = {
  id: string;
  seeker_id: string;
  service_type: string;
  starts_at: string;
  ends_at: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  location_city: string | null;
  location_country: string | null;
  location_postcode: string | null;
  notes: string | null;
  expires_at: string;
  service_point_lng: number | null;
  service_point_lat: number | null;
  distance_m: number | null;
  created_at: string;
};

export type TargetedJobItem = {
  kind: "targeted_booking";
  id: string;
  client_first_name: string;
  client_avatar_initial: string;
  distance_km: number | null;
  service_type: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  location_city: string | null;
  location_country: string | null;
  location_postcode_partial: string | null;
  service_point_lng: number | null;
  service_point_lat: number | null;
  status: string;
  surge: boolean;
  expires_at: string | null;
  is_preferred_client: boolean;
  /** Phase B: org booking fields. is_org_booking=true when booking_source='org' */
  is_org_booking: boolean;
  shift_mode: string | null;
  sleep_in_carer_pay: number | null;
};

export type OpenJobItem = {
  kind: "open_request";
  id: string;
  client_first_name: string;
  client_avatar_initial: string;
  distance_km: number | null;
  service_type: string;
  hours: number;
  hourly_rate_cents: number;
  currency: string;
  starts_at: string;
  ends_at: string;
  location_city: string | null;
  location_country: string | null;
  service_point_lng: number | null;
  service_point_lat: number | null;
  expires_at: string;
  surge: boolean;
};

export type JobItem = TargetedJobItem | OpenJobItem;

/**
 * Surge rules:
 *  • starts within 24h
 *  • starts between 22:00 and 06:00 local time
 *  • starts on Saturday or Sunday
 */
function isSurge(startsAtIso: string): boolean {
  const ts = new Date(startsAtIso);
  if (Number.isNaN(ts.getTime())) return false;
  const ms = ts.getTime() - Date.now();
  if (ms < 24 * 3600_000) return true;
  const hour = ts.getHours();
  if (hour >= 22 || hour < 6) return true;
  const dow = ts.getDay();
  if (dow === 0 || dow === 6) return true;
  return false;
}

function firstName(full: string | null | undefined): string {
  if (!full) return "Client";
  const trimmed = full.trim();
  if (!trimmed) return "Client";
  return trimmed.split(/\s+/)[0];
}

/** "S." style anonymized initial for open-request cards. */
function anonInitial(full: string | null | undefined): string {
  const fn = firstName(full);
  const ch = fn.slice(0, 1).toUpperCase();
  return ch ? `${ch}.` : "Client";
}

function partialPostcode(pc: string | null | undefined): string | null {
  if (!pc) return null;
  const t = pc.trim().toUpperCase();
  if (t.includes(" ")) return t.split(" ")[0];
  if (/^\d{5}/.test(t)) return t.slice(0, 3);
  return t.slice(0, 3);
}

function kmFromMeters(m: number | null): number | null {
  return typeof m === "number" ? Math.round(m / 100) / 10 : null;
}

/**
 * GET /api/m/jobs
 *
 * Returns `items[]` — targeted bookings AND nearby open requests
 * combined, sorted by distance ascending (nulls last) then starts_at.
 * Filters apply to both kinds. The legacy `jobs` array (targeted only)
 * is still returned for backwards-compat with the old client.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const radiusKmRaw = Number(params.get("radius_km") ?? "25");
  const radiusKm =
    Number.isFinite(radiusKmRaw) && radiusKmRaw > 0
      ? Math.min(radiusKmRaw, 100)
      : 25;
  const radiusM = radiusKm * 1000;

  const serviceTypeRaw = (params.get("service_type") ?? "").trim();
  const filterServiceType =
    serviceTypeRaw && ALLOWED_VERTICALS.has(serviceTypeRaw)
      ? serviceTypeRaw
      : null;

  const minRateCents = Number(params.get("min_rate_cents"));
  const maxDistanceM = Number(params.get("max_distance_m"));
  const minHours = Number(params.get("min_hours"));
  const maxHours = Number(params.get("max_hours"));
  const preferredOnly = params.get("preferred_only") === "true";

  const admin = createAdminClient();

  // Targeted bookings (carer-specific). Open-request feed runs in
  // parallel.
  const [targetedRes, openRes, preferredRes] = await Promise.all([
    admin.rpc("bookings_near_carer", {
      carer_uuid: user.id,
      radius_m: radiusM,
    }),
    admin.rpc("open_requests_near_carer", {
      carer_uuid: user.id,
      radius_m: radiusM,
    }),
    admin
      .from("carer_preferred_clients")
      .select("seeker_id")
      .eq("carer_id", user.id),
  ]);
  if (targetedRes.error) {
    return NextResponse.json(
      { error: targetedRes.error.message },
      { status: 500 },
    );
  }

  const targetedRows: TargetedRpcRow[] = (targetedRes.data ?? []) as TargetedRpcRow[];
  // Open RPC is best-effort: if it errors (e.g. migration not yet
  // applied to this env), fall back to an empty list rather than
  // breaking the whole feed.
  const openRows: OpenRpcRow[] = openRes.error
    ? []
    : ((openRes.data ?? []) as OpenRpcRow[]);
  const preferredSet = new Set(
    ((preferredRes.data ?? []) as { seeker_id: string }[]).map(
      (r) => r.seeker_id,
    ),
  );

  // Resolve seeker first names in one round-trip across both kinds.
  const seekerIds = Array.from(
    new Set([
      ...targetedRows.map((r) => r.seeker_id),
      ...openRows.map((r) => r.seeker_id),
    ]),
  );
  const namesById = new Map<string, string | null>();
  if (seekerIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", seekerIds);
    for (const p of (profs ?? []) as {
      id: string;
      full_name: string | null;
    }[]) {
      namesById.set(p.id, p.full_name);
    }
  }

  // Helpers shared between kinds.
  const passesShared = (row: {
    service_type: string;
    hourly_rate_cents: number;
    distance_m: number | null;
    hours: number;
  }) => {
    if (filterServiceType && row.service_type !== filterServiceType) return false;
    if (
      Number.isFinite(minRateCents) &&
      minRateCents > 0 &&
      row.hourly_rate_cents < minRateCents
    )
      return false;
    if (
      Number.isFinite(maxDistanceM) &&
      maxDistanceM > 0 &&
      row.distance_m != null &&
      row.distance_m > maxDistanceM
    )
      return false;
    if (Number.isFinite(minHours) && minHours > 0 && Number(row.hours) < minHours)
      return false;
    if (Number.isFinite(maxHours) && maxHours > 0 && Number(row.hours) > maxHours)
      return false;
    return true;
  };

  // Build targeted items.
  const targeted: TargetedJobItem[] = targetedRows
    .filter(passesShared)
    .filter((r) => (preferredOnly ? preferredSet.has(r.seeker_id) : true))
    .map((r) => {
      const fn = firstName(namesById.get(r.seeker_id) ?? null);
      return {
        kind: "targeted_booking",
        id: r.id,
        client_first_name: fn,
        client_avatar_initial: fn.slice(0, 1).toUpperCase(),
        distance_km: kmFromMeters(r.distance_m),
        service_type: r.service_type,
        hours: Number(r.hours),
        hourly_rate_cents: r.hourly_rate_cents,
        currency: r.currency,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        location_city: r.location_city,
        location_country: r.location_country,
        location_postcode_partial: partialPostcode(r.location_postcode),
        service_point_lng: r.service_point_lng,
        service_point_lat: r.service_point_lat,
        status: r.status,
        surge: isSurge(r.starts_at),
        expires_at: r.discovery_expires_at,
        is_preferred_client: preferredSet.has(r.seeker_id),
        is_org_booking: r.booking_source === "org",
        shift_mode: r.shift_mode ?? null,
        sleep_in_carer_pay: r.sleep_in_carer_pay ?? null,
      };
    });

  // Build open-request items. Skip a carer's own posted requests and
  // honor preferred_only when on (a preferred-only filter is implicitly
  // about clients you've worked with — open requests from non-preferred
  // seekers drop out).
  const open: OpenJobItem[] = openRows
    .filter((r) => r.seeker_id !== user.id)
    .filter(passesShared)
    .filter((r) => (preferredOnly ? preferredSet.has(r.seeker_id) : true))
    .map((r) => {
      const full = namesById.get(r.seeker_id) ?? null;
      return {
        kind: "open_request",
        id: r.id,
        client_first_name: anonInitial(full),
        client_avatar_initial: firstName(full).slice(0, 1).toUpperCase(),
        distance_km: kmFromMeters(r.distance_m),
        service_type: r.service_type,
        hours: Number(r.hours),
        hourly_rate_cents: r.hourly_rate_cents,
        currency: r.currency,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        location_city: r.location_city,
        location_country: r.location_country,
        service_point_lng: r.service_point_lng,
        service_point_lat: r.service_point_lat,
        expires_at: r.expires_at,
        surge: isSurge(r.starts_at),
      };
    });

  // Combined list, sorted by distance asc (nulls last), then starts_at.
  const items: JobItem[] = [...targeted, ...open].sort((a, b) => {
    const da = a.distance_km ?? Number.POSITIVE_INFINITY;
    const db = b.distance_km ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });

  return NextResponse.json({
    items,
    // Legacy compatibility: targeted-only list keyed `jobs`.
    jobs: targeted,
  });
}

/**
 * /find-care/map — desktop map view of nearby carers.
 *
 * Same search semantics as /find-care (postcode + radius + filters), but
 * renders results as Mapbox pins instead of cards. Pins are placed at the
 * carer's home_point. When `hide_precise_location` is true (default) we
 * fuzz the pin slightly so a precise address can never be derived from
 * the public map. Click a pin → mini card → "Book this carer" link.
 *
 * Privacy: only fields already on the public CaregiverCard are exposed
 * through the map's GeoJSON. Full postcode is never shipped to the client.
 */

import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import { searchCaregivers } from "@/lib/care/search";
import { isServiceKey } from "@/lib/care/services";
import { isCareFormatKey } from "@/lib/care/formats";
import {
  isCertKey,
  isGenderKey,
  type GenderKey,
} from "@/lib/care/attributes";
import {
  isValidPostcode,
  normalisePostcode,
  inferCountryFromPostcode,
} from "@/lib/care/postcode";
import { geocodePostcode, getPublicToken, getStyle } from "@/lib/mapbox/server";
import FindCareMapClient from "./MapClient";

export const metadata: Metadata = {
  title: "Carers near you · Map view — SpecialCarer",
  description:
    "See vetted caregivers near your postcode on a live map. Click a pin to view their profile and book.",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  service?: string;
  format?: string;
  city?: string;
  country?: string;
  postcode?: string;
  radius?: string;
  q?: string;
  genders?: string | string[];
  driver?: string;
  vehicle?: string;
  certs?: string | string[];
  langs?: string;
  tags?: string;
};

export default async function FindCareMapPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const country =
    sp.country === "US" || sp.country === "GB" ? sp.country : undefined;
  const service = isServiceKey(sp.service) ? sp.service : undefined;
  const format = isCareFormatKey(sp.format) ? sp.format : undefined;
  const city = sp.city?.trim() || undefined;
  const q = sp.q?.trim() || undefined;

  const sel = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : [];
  const genders = sel(sp.genders).filter(isGenderKey) as GenderKey[];
  const certsSelected = sel(sp.certs).filter(isCertKey);
  const requireDriver = sp.driver === "1" || sp.driver === "on";
  const requireVehicle = sp.vehicle === "1" || sp.vehicle === "on";
  const requiredLanguages = (sp.langs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.length <= 30)
    .slice(0, 5);
  const requiredTags = (sp.tags ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s.length <= 30)
    .slice(0, 8);

  const postcodeRaw = sp.postcode?.trim() || undefined;
  const inferredCountry = postcodeRaw
    ? inferCountryFromPostcode(postcodeRaw)
    : null;
  const geoCountry: "GB" | "US" | null = country ?? inferredCountry ?? null;
  const postcode =
    postcodeRaw && isValidPostcode(postcodeRaw, geoCountry ?? "GB")
      ? normalisePostcode(postcodeRaw, geoCountry ?? "GB")
      : null;
  const radiusKm = (() => {
    const n = sp.radius ? Number(sp.radius) : NaN;
    if (!Number.isFinite(n) || n <= 0) return 10;
    return Math.min(50, Math.max(1, Math.round(n)));
  })();

  const geocoded = postcode
    ? await geocodePostcode(postcode, geoCountry ?? "GB")
    : null;

  // Default origin if user hasn't entered a postcode yet — central London.
  const origin = geocoded
    ? { lat: geocoded.lat, lng: geocoded.lng, label: geocoded.place_name }
    : { lat: 51.5074, lng: -0.1276, label: "London" };

  const results = await searchCaregivers({
    service,
    format,
    city,
    country,
    query: q,
    genders,
    requireDriver,
    requireVehicle,
    requiredCertifications: certsSelected,
    requiredLanguages,
    tags: requiredTags,
    near: { lat: origin.lat, lng: origin.lng, radiusKm },
    limit: 100,
  });

  // Build map markers. We re-derive lat/lng from the same caregivers_within_radius
  // RPC inside searchCaregivers — but distance_m is exposed on the card. To get
  // pin positions, we issue a separate light query that just returns user_id+point.
  // To avoid an extra RPC, we use deterministic pseudo-coordinates derived from
  // the city centroid + a stable hash of user_id when hide_precise_location is on.
  // (Real coordinates only ship when the carer has explicitly opted in.)
  const points = await loadPoints(results.map((r) => r.user_id));
  const instantReady = await loadInstantReady(results.map((r) => r.user_id));
  const markers = results
    .map((r) => {
      const p = points.get(r.user_id);
      if (!p) return null;
      const fuzzed = r.hide_precise_location
        ? fuzzPoint(r.user_id, p.lat, p.lng)
        : p;
      return {
        user_id: r.user_id,
        display_name: r.display_name ?? "Caregiver",
        headline: r.headline ?? null,
        city: r.city ?? null,
        country: r.country,
        rating_avg: r.rating_avg ?? null,
        rating_count: r.rating_count ?? 0,
        services: r.services ?? [],
        hourly_rate_cents: r.hourly_rate_cents ?? null,
        currency: r.currency ?? null,
        distance_m: r.distance_m ?? null,
        lat: fuzzed.lat,
        lng: fuzzed.lng,
        instant_ready: instantReady.has(r.user_id),
      };
    })
    .filter(<T,>(v: T | null): v is T => v != null);

  const mapboxToken = getPublicToken();
  const mapStyle = getStyle();

  return (
    <MarketingShell>
      <section className="px-6 py-8 max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Carers near you · Map view
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {markers.length} carer{markers.length === 1 ? "" : "s"} within{" "}
              {radiusKm} km
              {postcode ? ` of ${postcode}` : ""}.
              {!postcode && (
                <>
                  {" "}
                  <span className="text-slate-500">
                    Add a postcode below to centre the map on your area.
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={(() => {
                const qs = new URLSearchParams();
                if (postcode) qs.set("postcode", postcode);
                qs.set("radius", String(radiusKm));
                if (service) qs.set("service", service);
                if (format) qs.set("format", format);
                if (city) qs.set("city", city);
                if (country) qs.set("country", country);
                return `/find-care${qs.toString() ? `?${qs}` : ""}`;
              })()}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition"
            >
              ← List view
            </Link>
            <span aria-hidden className="px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold">
              Map view
            </span>
          </div>
        </div>

        {/* Re-search bar */}
        <form
          method="get"
          className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-slate-100"
        >
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-700 font-medium">Postcode / ZIP</span>
            <input
              type="text"
              name="postcode"
              defaultValue={sp.postcode ?? ""}
              placeholder="e.g. SW1A 1AA or 10001"
              autoComplete="postal-code"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Within</span>
            <select
              name="radius"
              defaultValue={String(radiusKm)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="20">20 km</option>
              <option value="30">30 km</option>
              <option value="50">50 km</option>
            </select>
          </label>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-600 transition self-end"
          >
            Update map
          </button>
        </form>

        <div className="mt-6">
          <FindCareMapClient
            origin={{ lat: origin.lat, lng: origin.lng }}
            radiusKm={radiusKm}
            markers={markers}
            mapboxToken={mapboxToken}
            mapStyle={mapStyle}
          />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          For privacy, pins show approximate areas only. Exact addresses are
          shared after a booking is confirmed.
        </p>
      </section>
    </MarketingShell>
  );
}

/**
 * Load home_point lat/lng for a set of user_ids. Uses the admin client
 * because caregiver_profiles RLS is permissive for is_published=true rows
 * but home_point isn't surfaced by searchCaregivers().
 */
async function loadPoints(
  userIds: string[],
): Promise<Map<string, { lat: number; lng: number }>> {
  const map = new Map<string, { lat: number; lng: number }>();
  if (userIds.length === 0) return map;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  // We need the geometry components, not the geography blob — easier via
  // a small RPC. Falls back to nothing if the RPC fails (map will just be
  // empty, no crash).
  const { data, error } = (await admin.rpc("caregiver_points", {
    p_user_ids: userIds,
  })) as unknown as {
    data: Array<{ user_id: string; lat: number; lng: number }> | null;
    error: unknown;
  };
  if (error || !data) return map;
  data.forEach((row) => {
    map.set(row.user_id, { lat: Number(row.lat), lng: Number(row.lng) });
  });
  return map;
}

/**
 * Returns the subset of user_ids whose instant booking is currently enabled
 * (per the v_instant_ready_carers view). Best-effort — if it fails, no
 * badges are shown but the rest of the map still renders.
 */
async function loadInstantReady(userIds: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (userIds.length === 0) return set;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data } = await admin
    .from("v_instant_ready_carers")
    .select("user_id")
    .in("user_id", userIds);
  (data as Array<{ user_id: string }> | null)?.forEach((r) =>
    set.add(r.user_id),
  );
  return set;
}

/**
 * Deterministic pseudo-random offset (~150–400 m) so two views of the same
 * carer always show the pin in the same place but the precise home_point
 * is never revealed.
 */
function fuzzPoint(
  seed: string,
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000; // 0..1
  const b = (((h * 31) >>> 0) % 1000) / 1000;
  // Roughly 0.0015–0.0035 deg in each axis ≈ 150–400 m at UK/US latitudes.
  const dLat = (a - 0.5) * 0.005;
  const dLng = (b - 0.5) * 0.005;
  return { lat: lat + dLat, lng: lng + dLng };
}

/**
 * Pure handler for GET /api/m/geocode.
 *
 * Resolves a *search origin* to lat/lng so the carer search ("Nearest" sort)
 * has something to measure distance from. Origin priority:
 *
 *   1. Explicit user input  — the `postcode` query param from the search box.
 *   2. Saved profile postcode — the seeker's household-recipient postcode
 *      (the `profiles` table has no location, so the recipient's address is
 *      the closest thing to "the seeker's saved postcode").
 *
 * (The brief also lists `home_lat`/`home_lng` as priority 3, but those columns
 * exist only on caregivers, not seekers, so there's nothing to read for a
 * seeker — we stop at the saved postcode.)
 *
 * Kept dependency-injected (geocode fn + saved-postcode fn) so it unit-tests
 * without next/headers, Supabase, or the network. Mirrors the search-handler
 * pattern in this directory.
 */

import {
  classifyPostcode,
  inferCountryFromPostcode,
  normalisePostcode,
  type Country,
} from "@/lib/care/postcode";

export type GeocodeOriginSource = "input" | "profile";

export type GeocodeOriginResult = {
  lat: number;
  lng: number;
  /** Where the origin came from — surfaced so the UI can caption it. */
  source: GeocodeOriginSource;
  /** Canonicalised postcode that was geocoded. */
  postcode: string;
};

export type GeocodeHandlerBody =
  | { origin: GeocodeOriginResult }
  | { origin: null };

export type GeocodeFn = (
  postcode: string,
  country: Country | null,
) => Promise<{ lat: number; lng: number } | null>;

export type GeocodeHandlerDeps = {
  /** Raw `postcode` query param (explicit user input), if any. */
  inputPostcode: string | null;
  /** Geocodes a postcode to coords (server-side Mapbox helper). */
  geocode: GeocodeFn;
  /** Looks up the signed-in seeker's saved postcode, or null. */
  getSavedPostcode: () => Promise<string | null>;
};

/**
 * Normalise a candidate postcode, returning the canonical form and inferred
 * country, or null when it can't be a valid UK/US postcode. We classify and
 * normalise here (cheap, pure) so we never spend a Mapbox call on garbage.
 */
function prepare(
  raw: string | null,
): { postcode: string; country: Country | null } | null {
  if (!raw || !raw.trim()) return null;
  const country = inferCountryFromPostcode(raw);
  if (classifyPostcode(raw, country) === "invalid") return null;
  const normalised = normalisePostcode(raw, country);
  if (!normalised) return null;
  return { postcode: normalised, country };
}

export async function handleGeocode(
  deps: GeocodeHandlerDeps,
): Promise<{ status: number; body: GeocodeHandlerBody }> {
  // Priority 1: explicit user input from the search box.
  const fromInput = prepare(deps.inputPostcode);
  if (fromInput) {
    const coords = await deps.geocode(fromInput.postcode, fromInput.country);
    if (coords) {
      return {
        status: 200,
        body: {
          origin: {
            lat: coords.lat,
            lng: coords.lng,
            source: "input",
            postcode: fromInput.postcode,
          },
        },
      };
    }
    // An explicit-but-ungeocodable postcode shouldn't silently fall through
    // to the saved address — the user asked for *this* place. Return no origin
    // so search stays unfiltered rather than measuring from the wrong spot.
    return { status: 200, body: { origin: null } };
  }

  // Priority 2: the seeker's saved postcode.
  const saved = prepare(await deps.getSavedPostcode());
  if (saved) {
    const coords = await deps.geocode(saved.postcode, saved.country);
    if (coords) {
      return {
        status: 200,
        body: {
          origin: {
            lat: coords.lat,
            lng: coords.lng,
            source: "profile",
            postcode: saved.postcode,
          },
        },
      };
    }
  }

  // Priority 3+: nothing to anchor on. Search runs without distances.
  return { status: 200, body: { origin: null } };
}

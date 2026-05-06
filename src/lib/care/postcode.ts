/**
 * Postcode / ZIP utilities — shared by the profile editor, booking form,
 * and search bar. Pure (no network), safe for client and server.
 *
 * UK regex from the Royal Mail PAF format spec; covers all valid live
 * postcode formats (incl. BFPO and partial outward codes for area search).
 * US ZIP supports both 5-digit and ZIP+4 (5-4).
 *
 * For genuine validity (e.g. "AA1A 1AA" passes regex but doesn't exist) we
 * defer to Mapbox at geocode time — that's where invalid postcodes get
 * rejected.
 */

const UK_FULL = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
// Outward code only (district level) — e.g. "SW1A", "M1", "B33", "DN55".
const UK_OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/i;
const US_ZIP = /^\d{5}(-\d{4})?$/;

export type Country = "GB" | "US";

export type PostcodeShape = "full" | "partial" | "invalid";

export function classifyPostcode(
  raw: string | null | undefined,
  country: Country | null | undefined,
): PostcodeShape {
  if (!raw) return "invalid";
  const v = raw.trim().toUpperCase();
  if (!v) return "invalid";
  if (country === "US") {
    return US_ZIP.test(v) ? "full" : "invalid";
  }
  // Default UK rules (also covers `null` country — most users are UK).
  if (UK_FULL.test(v)) return "full";
  if (UK_OUTWARD.test(v)) return "partial";
  return "invalid";
}

export function isValidPostcode(
  raw: string | null | undefined,
  country: Country | null | undefined,
): boolean {
  return classifyPostcode(raw, country) !== "invalid";
}

/**
 * Normalise to canonical form for storage / equality:
 *   UK full: "sw1a1aa" -> "SW1A 1AA"
 *   UK outward: "sw1a" -> "SW1A"
 *   US: "10001" / "10001-1234" unchanged (uppercased -> 10001 / 10001-1234)
 * Returns null for invalid input.
 */
export function normalisePostcode(
  raw: string | null | undefined,
  country: Country | null | undefined,
): string | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (country === "US") {
    return US_ZIP.test(v) ? v : null;
  }
  if (UK_FULL.test(v)) {
    // Insert the conventional space before the final 3 chars.
    return `${v.slice(0, v.length - 3)} ${v.slice(-3)}`;
  }
  if (UK_OUTWARD.test(v)) {
    return v;
  }
  return null;
}

/** Country inference from raw postcode shape. Used when the user pastes a postcode without picking a country. */
export function inferCountryFromPostcode(
  raw: string | null | undefined,
): Country | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (US_ZIP.test(v)) return "US";
  if (UK_FULL.test(v) || UK_OUTWARD.test(v)) return "GB";
  return null;
}

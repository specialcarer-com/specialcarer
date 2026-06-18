/**
 * PII scrubbing for Sentry events.
 *
 * This module deliberately depends on NOTHING from `@sentry/nextjs` so it can
 * be unit-tested under `tsx`/`node:test` without loading the SDK. The Sentry
 * configs import `scrubEvent` and hand it the real event object; the loose
 * `SentryEventLike` shape below is structurally compatible with the SDK's
 * `Event` type for the fields we touch.
 *
 * Policy (see the Sentry integration brief): events must never carry raw PII.
 * We strip a fixed set of sensitive keys wherever they appear (request data,
 * breadcrumbs, extra, contexts, user) and we truncate any UK postcode down to
 * its outward code (e.g. "SW1A 1AA" -> "SW1A").
 */

export const REDACTED = "[redacted]";

/**
 * Object keys whose VALUE must be redacted entirely, matched case-insensitively
 * and ignoring non-alphanumeric separators so `date_of_birth`, `dateOfBirth`
 * and `DATE-OF-BIRTH` all match the same rule.
 */
const SENSITIVE_KEYS: readonly string[] = [
  "date_of_birth",
  "dob",
  "national_insurance",
  "ni_number",
  "dbs_certificate_number",
  "passport_number",
  "bank_account",
  "iban",
  "sort_code",
  // address sub-fields
  "line1",
  "line2",
  "address_line1",
  "address_line2",
  // request headers that carry session material
  "cookie",
  "authorization",
  "x_access_token",
];

/** Keys whose value is a postcode and should be reduced to the outward code. */
const POSTCODE_KEYS: readonly string[] = ["postcode", "post_code", "postal_code", "zip"];

/** Normalise a key for matching: lowercase, strip non-alphanumerics. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SENSITIVE_SET = new Set(SENSITIVE_KEYS.map(normaliseKey));
const POSTCODE_SET = new Set(POSTCODE_KEYS.map(normaliseKey));

/**
 * Reduce a UK postcode to its outward code (the part before the space):
 * "SW1A 1AA" -> "SW1A", "M1 1AE" -> "M1". Non-string / unrecognised values are
 * returned untouched so we never throw on unexpected shapes.
 */
export function outwardPostcode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  // Outward code is everything up to the first whitespace. If there is no
  // space, fall back to stripping the trailing inward unit (digit + 2 letters).
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx > 0) return trimmed.slice(0, spaceIdx).toUpperCase();
  const compact = trimmed.toUpperCase();
  const m = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/);
  return m ? m[1] : compact;
}

/**
 * Recursively walk an arbitrary value, redacting sensitive keys and truncating
 * postcodes. Cycles are tracked with a WeakSet so self-referential objects
 * (which Sentry events can contain) don't cause infinite recursion.
 */
function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = scrubValue(value[i], seen);
    }
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const norm = normaliseKey(key);
    if (SENSITIVE_SET.has(norm)) {
      obj[key] = REDACTED;
      continue;
    }
    if (POSTCODE_SET.has(norm)) {
      obj[key] = outwardPostcode(obj[key]);
      continue;
    }
    obj[key] = scrubValue(obj[key], seen);
  }
  return obj;
}

/**
 * Scrub an event in place and return it. Generic so it slots straight into a
 * Sentry `beforeSend` callback (which is typed to return the same event type it
 * received). Safe to call with `null` (returns it unchanged).
 *
 * The walk covers the whole event, so nested PII anywhere is caught — including
 * `request.headers.cookie`, `breadcrumbs[].data.*` and `extra.*`.
 */
export function scrubEvent<T>(event: T): T {
  if (event === null || typeof event !== "object") return event;
  const seen = new WeakSet<object>();
  scrubValue(event, seen);
  return event;
}

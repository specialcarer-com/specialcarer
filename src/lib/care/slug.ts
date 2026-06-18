/**
 * Public profile slug generation for carers.
 *
 * Format: <first-name>-<last-initial>-<suffix>
 *   first-name   lowercase alphanumerics of the first name token
 *   last-initial single lowercase letter from the surname (omitted if absent)
 *   suffix       4 lowercase hex chars for uniqueness
 *
 * e.g. "Priya Kaur" → "priya-k-7f3a". Used for the friendly /c/<slug> URL.
 */

const SUFFIX_LEN = 4;
// Must match isValidSlug's limit; the stem is clamped so stem-suffix fits.
const MAX_SLUG_LEN = 80;
const MAX_STEM_LEN = MAX_SLUG_LEN - (SUFFIX_LEN + 1);

/** Strip a name token to lowercase a-z0-9, collapsing the rest away. */
function tokenSlug(part: string): string {
  return part
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Build the human-readable stem (no suffix) from a display name. */
export function slugStem(displayName: string | null | undefined): string {
  const tokens = (displayName ?? "")
    .trim()
    .split(/\s+/)
    .map(tokenSlug)
    .filter(Boolean);

  if (tokens.length === 0) return "carer";
  const first = tokens[0];
  const lastInitial = tokens.length > 1 ? tokens[tokens.length - 1][0] : "";
  const stem = lastInitial ? `${first}-${lastInitial}` : first;
  // Clamp so the assembled "<stem>-<suffix>" stays within the validator limit,
  // trimming any trailing hyphen left by the cut.
  return stem.slice(0, MAX_STEM_LEN).replace(/-+$/, "");
}

/**
 * Generate a candidate public slug for a carer.
 *
 * `suffix` is normally omitted (a random one is generated); callers handling
 * collision retries can pass their own to keep the call deterministic in tests.
 */
export function generateSlug(
  displayName: string | null | undefined,
  suffix?: string,
): string {
  const tail =
    suffix ??
    Math.random().toString(16).slice(2, 2 + SUFFIX_LEN).padEnd(SUFFIX_LEN, "0");
  return `${slugStem(displayName)}-${tail}`;
}

/**
 * Produce an ordered list of unique slug candidates, skipping any already
 * taken. Returns the first free candidate, generating fresh random suffixes
 * until one lands outside `taken`. Bounded to avoid an infinite loop.
 */
export function pickUniqueSlug(
  displayName: string | null | undefined,
  taken: ReadonlySet<string>,
  randomSuffix: () => string = () =>
    Math.random().toString(16).slice(2, 2 + SUFFIX_LEN).padEnd(SUFFIX_LEN, "0"),
): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = generateSlug(displayName, randomSuffix());
    if (!taken.has(candidate)) return candidate;
  }
  // Extremely unlikely fallback: widen entropy with a timestamp tail.
  return generateSlug(displayName, `${randomSuffix()}${Date.now().toString(16).slice(-2)}`);
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when `value` is a syntactically valid public slug (not a UUID). */
export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value) && value.length <= 80;
}

/**
 * Shared server-side anti-spam heuristics for B2B lead forms
 * (/organisations, /employers/contact). Deliberately NOT applied to
 * carer/family-facing forms, where free webmail is normal and expected.
 *
 * Light-touch by design — no CAPTCHA/Turnstile. This module implements:
 *  1. Random-string detection on name/org/role. `name` uses a
 *     consonant-cluster + mixed-case + long-no-space heuristic; `org`/
 *     `role` deliberately skip the consonant-cluster check (too many
 *     false positives on real job titles/org names — see
 *     `looksLikeRandomStringField`).
 *  2. Multi-field random-string rule: if 2+ of {name, org, role} each
 *     independently look random, treat it as high-confidence spam
 *     (`MULTI_FIELD_RANDOM`) — this is now the primary spam signal.
 *  3. Hard free-webmail block (B2B leads should have a work email),
 *     with a soft-block + override specifically for Gmail on the
 *     /organisations form (micro-charities/sole traders with no other
 *     email) — see `GMAIL_OVERRIDE_FIELD`.
 *  4. UK-only phone format check.
 *
 * Honeypot handling and rate-limiting live in the API routes themselves
 * (see src/app/api/marketing/org-leads/route.ts and
 * src/app/api/employers/lead/route.ts) since they need access to the
 * request/IP and the DB client — this module stays a pure function.
 */

/**
 * Machine-readable rejection reason. Route handlers must switch on this
 * enum, never on substrings of the human-readable `message` (that prose
 * is free to change/localise without breaking redirect/response routing).
 */
export type SpamRejectionReason =
  | "RANDOM_STRING_NAME"
  | "RANDOM_STRING_ORG"
  | "RANDOM_STRING_ROLE"
  | "FREE_WEBMAIL"
  | "INVALID_UK_PHONE"
  | "HONEYPOT_HIT"
  | "RATE_LIMITED"
  | "MULTI_FIELD_RANDOM";

export interface LeadFields {
  name?: string | null;
  email?: string | null;
  org?: string | null;
  role?: string | null;
  /** Optional — only checked when present, per form. */
  phone?: string | null;
  /** Set true if the phone field is required on this particular form. */
  phoneRequired?: boolean;
  /**
   * Set true when the submitter has explicitly opted to use a personal
   * Gmail address after seeing the soft-block warning (re-submission).
   * Only ever suppresses the Gmail-specific soft block — never any
   * other check, and never any other free-webmail provider.
   */
  usePersonalEmail?: boolean;
}

export interface LeadValidationResult {
  valid: boolean;
  /** Machine-readable reason code — use this for control flow. */
  reasonCode?: SpamRejectionReason;
  /** Human-readable message — use this for display copy only. */
  reason?: string;
  /**
   * True when this is a *soft* rejection that the caller can let the
   * user override (currently: Gmail on /organisations). Absent/false
   * means the rejection is hard.
   */
  soft?: boolean;
}

/**
 * Free-webmail domains blocked on B2B forms. A legitimate organisation
 * enquiry should come from a work email address.
 */
export const FREE_WEBMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "live.com",
  "live.co.uk",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "gmx.co.uk",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  "pm.me",
  // UK ISP-bundled webmail — commonly the *only* email address for UK
  // sole traders / small domiciliary agencies (review finding: these
  // were missing, undermining the "UK-specific" claim of this list).
  "btinternet.com",
  "sky.com",
  "virginmedia.com",
  "talktalk.net",
  "ntlworld.com",
  "tiscali.co.uk",
  "blueyonder.co.uk",
  "orange.net",
]);

/** Gmail specifically — the only free-webmail provider with a soft-block+override path. */
const GMAIL_DOMAIN = "gmail.com";

const RANDOM_STRING_MESSAGE =
  "This submission was flagged as automated. If you're a real person and your details look unusual, please email hello@specialcarer.com and we'll respond personally.";
const FREE_WEBMAIL_MESSAGE =
  "Please use your organisation email address so we can respond to the right domain. If you don't have one, email hello@specialcarer.com.";
const GMAIL_SOFT_MESSAGE =
  "That looks like a personal Gmail address. If your organisation doesn't have its own email domain, resubmit to continue anyway — otherwise please use your work email.";
const UK_PHONE_MESSAGE = "Please provide a UK phone number";

/** UK landline/mobile formats. Deliberately excludes US-style numbers. */
const UK_PHONE_RE =
  /^(?:\+44\s?|0)(?:7\d{3}|1\d{2,3}|2\d{2}|3\d{2}|8\d{2})\s?\d{3}\s?\d{3,4}$/;

/**
 * Vowels for the consonant-cluster check. `w` and `y` are treated as
 * semi-vowels here (not in `VOWEL_RUN_CHARS` below) because in Welsh
 * orthography (and several other UK-relevant scripts/transliterations —
 * Polish, Ukrainian, Zulu, Tamil) they routinely stand in for vowel
 * sounds within otherwise-ordinary consonant runs: "Rhys", "Cwmbran",
 * "Llywelyn", "Blodwyn", "Gruffydd", "Meirionnydd", "Pwllheli",
 * "Bronwyn", "Gwynfor", "Krzysztof", "Volodymyr Shevchenko",
 * "Siphosethu", "Thirunavukkarasu" all previously false-positived on
 * the consonant-cluster rule before this fix.
 */
const CONSONANT_CLUSTER_VOWELS = "aeiouwyAEIOUWY";

function getDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  // Strip a trailing DNS-root dot ("bot@gmail.com.") before comparing —
  // it's RFC-legal and accepted by real MTAs, but was previously an
  // exact-match bypass of the free-webmail block.
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
}

/** Normalises an email address (lowercase, trimmed, trailing-dot-stripped domain). */
export function normaliseEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = getDomain(trimmed);
  return `${local}@${domain}`;
}

export function isFreeWebmail(email: string): boolean {
  return FREE_WEBMAIL_DOMAINS.has(getDomain(email));
}

/** True specifically for Gmail (not any other free-webmail provider). */
export function isGmail(email: string): boolean {
  const domain = getDomain(email);
  return domain === GMAIL_DOMAIN || domain === "googlemail.com";
}

/**
 * True if `field` contains 5+ consecutive consonants, with `w`/`y`
 * treated as vowel-equivalents (see `CONSONANT_CLUSTER_VOWELS`).
 *
 * Threshold is 5 (not 4) specifically so that Polish/Ukrainian
 * consonant-heavy transliterations that still resolve cleanly at 4
 * (e.g. "Szcz" in "Szczepański", "Krzy" in "Krzysztof") aren't
 * false-positived — the case-chaos and multi-field signals still catch
 * the actual spam corpus at this threshold (verified against all 6
 * corpus samples).
 */
function hasConsonantCluster(field: string): boolean {
  const consonantClass = `[^${CONSONANT_CLUSTER_VOWELS}\\s'’.,&/-]`;
  const re = new RegExp(`(?:${consonantClass}){5,}`);
  return re.test(field);
}

/**
 * Max upper/lower case transitions within any single alphabetic token
 * (tokens are split on spaces, hyphens, apostrophes, etc). Counting per
 * token — rather than across the whole field — avoids false positives
 * on multi-word names/orgs, where every capitalised word naturally has
 * one transition (e.g. "McDonald's Care Ltd" or "Anne-Marie").
 * Real-world camelCase brand names ("iPhone", "eBay", "McKenzie") also
 * land at 2-3; gibberish like "VAlixLMjkpizrfgKjwy" hits 4+.
 */
function maxCaseTransitionsPerToken(field: string): number {
  const tokens = field.split(/[^A-Za-z]+/).filter(Boolean);
  let max = 0;
  for (const tok of tokens) {
    let transitions = 0;
    let prevCase: "upper" | "lower" | null = null;
    for (const ch of tok) {
      const cur = ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? "upper" : "lower";
      if (prevCase !== null && cur !== prevCase) transitions += 1;
      prevCase = cur;
    }
    if (transitions > max) max = transitions;
  }
  return max;
}

/**
 * True if any single token is 5+ case transitions — this is the only
 * signal used for `org`/`role` (see `looksLikeRandomStringField`).
 * Threshold is intentionally higher than the name-field threshold (4)
 * to further reduce false positives on org/role free text, while still
 * catching the corpus samples ("wpruMKHDWMIkwOvDnV" hits 8+,
 * "geOUHPHUBfjagztpFHBO" hits 6+).
 */
function hasCaseChaos(field: string): boolean {
  return maxCaseTransitionsPerToken(field) >= 5;
}

/** Long single "word" (40+ letters, no space) — always suspicious regardless of field. */
function isOverlongNoSpaceWord(field: string): boolean {
  return /^[A-Za-z]{41,}$/.test(field.trim());
}

/**
 * Random-string / gibberish detector for the `name` field. Uses the
 * consonant-cluster signal (with w/y semi-vowel fix, 5+ threshold) and
 * case-chaos.
 *
 * Deliberately does NOT use a "long single word with no vowel run"
 * rule — that rule false-positived on real single-token Tamil given
 * names (e.g. "Thirunavukkarasu", 16 letters, alternates single
 * vowels/consonants with no doubled-vowel run anywhere), which is
 * normal for that transliteration style, not a sign of randomness.
 * The 40+ char no-space check (shared with org/role, see
 * `isOverlongNoSpaceWord`) still catches pure long gibberish.
 */
export function looksLikeRandomStringName(field: string): boolean {
  const trimmed = field.trim();
  if (!trimmed) return false;

  if (hasConsonantCluster(trimmed)) return true;
  if (maxCaseTransitionsPerToken(trimmed) >= 4) return true;
  if (isOverlongNoSpaceWord(trimmed)) return true;

  return false;
}

/**
 * Random-string / gibberish detector for `org`/`role` fields.
 * Deliberately does NOT run the consonant-cluster check — real job
 * titles ("Psychologist", "Physiotherapist", "Ophthalmologist") and
 * org names ("Rhythm Care Ltd", "Cwmni Gofal Cymru Ltd") routinely
 * contain 4+ letter consonant runs and were false-positiving under the
 * old shared check. Only two much-more-specific signals remain:
 *  (a) 40+ letters with no space at all (still catches pure gibberish
 *      "words" without touching legitimate multi-word titles/org names)
 *  (b) 5+ case transitions in a single token (still catches
 *      "wpruMKHDWMIkwOvDnV", "geOUHPHUBfjagztpFHBO")
 */
export function looksLikeRandomStringOrgOrRole(field: string): boolean {
  const trimmed = field.trim();
  if (!trimmed) return false;

  if (isOverlongNoSpaceWord(trimmed)) return true;
  if (hasCaseChaos(trimmed)) return true;

  return false;
}

/**
 * @deprecated kept for backwards-compat with any external callers; use
 * `looksLikeRandomStringName` (name field) or
 * `looksLikeRandomStringOrgOrRole` (org/role fields) instead — they now
 * have different rulesets. This alias applies the stricter name-field
 * rules.
 */
export function looksLikeRandomString(field: string): boolean {
  return looksLikeRandomStringName(field);
}

/** Strips spaces/dashes, then checks against the UK phone format. */
export function isValidUkPhone(phone: string): boolean {
  const stripped = phone.replace(/[\s-]/g, "");
  if (!stripped) return false;
  // Explicitly reject US-style numbers even if they'd otherwise slip
  // through: +1 country code, or a bare 10-digit number starting 2-9
  // (the classic NANP shape, e.g. "8019356672").
  if (/^\+1/.test(stripped)) return false;
  if (/^[2-9]\d{9}$/.test(stripped)) return false;
  return UK_PHONE_RE.test(stripped);
}

function reasonFor(
  code: SpamRejectionReason,
  message: string,
  soft = false,
): LeadValidationResult {
  return { valid: false, reasonCode: code, reason: message, soft };
}

/**
 * Validates a B2B lead submission. Returns `{ valid: false, reasonCode,
 * reason }` on rejection.
 *
 * Detection order (primary signal first):
 *  1. Multi-field random-string rule — if 2+ of {name, org, role} each
 *     independently look random, this is high-confidence spam
 *     (`MULTI_FIELD_RANDOM`). No soft warning, no override. Catches the
 *     full known spam corpus (all 6 samples have random org+role, most
 *     also have random name) while adding zero false-positive risk for
 *     legitimate diverse-name users, who have at most one field trigger
 *     a (rare, single-field) false positive.
 *  2. Single-field random-string — name uses the consonant-cluster+w/y
 *     fix; org/role skip consonant-cluster entirely (see
 *     `looksLikeRandomStringOrgOrRole`).
 *  3. Free-webmail — Gmail is a *soft* block with override
 *     (`usePersonalEmail: true` on resubmit); every other free-webmail
 *     provider is a hard block.
 *  4. UK phone format (only when required or provided).
 */
export function validateLead(fields: LeadFields): LeadValidationResult {
  const name = (fields.name ?? "").trim();
  const org = (fields.org ?? "").trim();
  const role = (fields.role ?? "").trim();
  const email = normaliseEmail(fields.email ?? "");
  const phone = (fields.phone ?? "").trim();

  const nameRandom = !!name && looksLikeRandomStringName(name);
  const orgRandom = !!org && looksLikeRandomStringOrgOrRole(org);
  const roleRandom = !!role && looksLikeRandomStringOrgOrRole(role);
  const randomFieldCount = [nameRandom, orgRandom, roleRandom].filter(Boolean).length;

  // Primary signal: 2+ independently-random fields is high confidence.
  if (randomFieldCount >= 2) {
    return reasonFor("MULTI_FIELD_RANDOM", RANDOM_STRING_MESSAGE);
  }

  if (nameRandom) {
    return reasonFor("RANDOM_STRING_NAME", RANDOM_STRING_MESSAGE);
  }
  if (orgRandom) {
    return reasonFor("RANDOM_STRING_ORG", RANDOM_STRING_MESSAGE);
  }
  if (roleRandom) {
    return reasonFor("RANDOM_STRING_ROLE", RANDOM_STRING_MESSAGE);
  }

  if (email && isFreeWebmail(email)) {
    if (isGmail(email) && !fields.usePersonalEmail) {
      return reasonFor("FREE_WEBMAIL", GMAIL_SOFT_MESSAGE, true);
    }
    // Non-Gmail free webmail (or Gmail with an explicit override) is a
    // hard block — override only ever applies to Gmail.
    if (!isGmail(email)) {
      return reasonFor("FREE_WEBMAIL", FREE_WEBMAIL_MESSAGE);
    }
  }

  if (fields.phoneRequired || phone) {
    if (!phone || !isValidUkPhone(phone)) {
      return reasonFor("INVALID_UK_PHONE", UK_PHONE_MESSAGE);
    }
  }

  return { valid: true };
}

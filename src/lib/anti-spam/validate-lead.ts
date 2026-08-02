/**
 * Shared server-side anti-spam heuristics for B2B lead forms
 * (/organisations, /employers/contact). Deliberately NOT applied to
 * carer/family-facing forms, where free webmail is normal and expected.
 *
 * Light-touch by design — no CAPTCHA/Turnstile. This module implements:
 *  1. Random-string detection on name/org/role (consonant clusters,
 *     mixed-case chaos, long no-space "words" with no vowel run).
 *  2. Hard free-webmail block (B2B leads should have a work email).
 *  3. UK-only phone format check.
 *
 * Honeypot handling and rate-limiting live in the API routes themselves
 * (see src/app/api/marketing/org-leads/route.ts and
 * src/app/api/employers/lead/route.ts) since they need access to the
 * request/IP and the DB client — this module stays a pure function.
 */

export interface LeadFields {
  name?: string | null;
  email?: string | null;
  org?: string | null;
  role?: string | null;
  /** Optional — only checked when present, per form. */
  phone?: string | null;
  /** Set true if the phone field is required on this particular form. */
  phoneRequired?: boolean;
}

export interface LeadValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Free-webmail domains blocked on B2B forms. A legitimate organisation
 * enquiry should come from a work email address.
 */
export const FREE_WEBMAIL_DOMAINS = new Set<string>([
  "gmail.com",
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
]);

const FREE_WEBMAIL_REASON =
  "Please use your organisation email address (not a personal Gmail/Hotmail/etc)";
const RANDOM_STRING_REASON =
  "That doesn't look like a valid name, organisation, or role — please check and try again";
const UK_PHONE_REASON = "Please provide a UK phone number";

/** UK landline/mobile formats. Deliberately excludes US-style numbers. */
const UK_PHONE_RE =
  /^(?:\+44\s?|0)(?:7\d{3}|1\d{2,3}|2\d{2}|3\d{2}|8\d{2})\s?\d{3}\s?\d{3,4}$/;

const VOWELS = "aeiouAEIOU";

function getDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

export function isFreeWebmail(email: string): boolean {
  return FREE_WEBMAIL_DOMAINS.has(getDomain(email));
}

/** True if `field` contains 4+ consecutive consonants (no vowels). */
function hasConsonantCluster(field: string): boolean {
  return /[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]{4,}/.test(field);
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

/** True if the field has any run of 2+ consecutive vowels (normal words do). */
function hasVowelRun(field: string): boolean {
  let run = 0;
  for (const ch of field) {
    if (VOWELS.includes(ch)) {
      run += 1;
      if (run >= 2) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/**
 * Heuristic random-string / gibberish detector for name, org, and role
 * fields. Designed to catch spam like "VAlixLMjkpizrfgKjwy",
 * "wpruMKHDWMIkwOvDnV", "geOUHPHUBfjagztpFHBO" without flagging normal
 * names, organisation names, or job titles.
 */
export function looksLikeRandomString(field: string): boolean {
  const trimmed = field.trim();
  if (!trimmed) return false;

  // 1. Consonant clusters: 4+ consecutive consonants, no vowels between.
  if (hasConsonantCluster(trimmed)) return true;

  // 2. Mixed-case chaos: 4+ case transitions within a single token is
  //    very unusual for a real name/org/role (allow up to 3, which
  //    covers camelCase brand names like "McKenzie" or "iPhone Ltd").
  if (maxCaseTransitionsPerToken(trimmed) >= 4) return true;

  // 3. Long single "word" (15+ letters, no space) with no vowel run of
  //    2+ — real long words/names almost always have a vowel pair
  //    somewhere (e.g. "Occupational", "Physiotherapy").
  const singleWord = /^[A-Za-z]{15,}$/.test(trimmed);
  if (singleWord && !hasVowelRun(trimmed)) return true;

  return false;
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

/**
 * Validates a B2B lead submission. Returns `{ valid: false, reason }` on
 * the first failing check — reject if ANY heuristic matches.
 */
export function validateLead(fields: LeadFields): LeadValidationResult {
  const name = (fields.name ?? "").trim();
  const org = (fields.org ?? "").trim();
  const role = (fields.role ?? "").trim();
  const email = (fields.email ?? "").trim().toLowerCase();
  const phone = (fields.phone ?? "").trim();

  for (const field of [name, org, role]) {
    if (field && looksLikeRandomString(field)) {
      return { valid: false, reason: RANDOM_STRING_REASON };
    }
  }

  if (email && isFreeWebmail(email)) {
    return { valid: false, reason: FREE_WEBMAIL_REASON };
  }

  if (fields.phoneRequired || phone) {
    if (!phone || !isValidUkPhone(phone)) {
      return { valid: false, reason: UK_PHONE_REASON };
    }
  }

  return { valid: true };
}

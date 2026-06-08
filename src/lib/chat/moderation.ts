/**
 * P1-B10: off-platform contact / payment detection.
 *
 * Scans a chat message body for patterns that suggest the participants
 * are trying to take the conversation (or the payment) off SpecialCarers.
 * Pure: no I/O. The caller decides what to do with matches — current
 * usage records auto-flags on every match so the admin queue can decide
 * the human action.
 *
 * Each pattern is named so the persisted flag row remembers *which*
 * signal fired. The reason mapping bucketises into the two off-platform
 * enum values used by chat_message_flags.
 */

export type ModerationReason = "off_platform_contact" | "off_platform_payment";

export type ModerationMatch = {
  /** Stable name for the matched pattern; persisted to detected_pattern. */
  pattern: string;
  reason: ModerationReason;
};

type PatternDef = {
  name: string;
  reason: ModerationReason;
  regex: RegExp;
};

/**
 * Pattern order is not significant — duplicates are collapsed by name
 * in {@link detectOffPlatform} so a body matching the same pattern
 * twice only contributes one flag (we care about "this kind of signal
 * fired", not how many times).
 *
 * All regexes are case-insensitive. Word boundaries (`\b`) keep the
 * common false positives down — e.g. "my number one priority" won't
 * trip the off-platform-phrase pattern because "number" is wrapped in
 * a `my (number|email|...)` group anchored on the literal "my".
 */
const PATTERNS: PatternDef[] = [
  {
    name: "uk_mobile",
    reason: "off_platform_contact",
    // UK mobiles: 07xxx xxx xxx or +44 7xxx xxx xxx. Optional single
    // space after the leading 0/+44. Whole-number match via \b so
    // "9-12-1995" style dates don't false-positive.
    regex: /\b(?:0|\+?44)\s?7\d{3}\s?\d{6}\b/i,
  },
  {
    name: "messaging_app_mention",
    reason: "off_platform_contact",
    regex: /\b(whatsapp|whats[\s-]?app|wa\.me|telegram|signal)\b/i,
  },
  {
    name: "email_address",
    reason: "off_platform_contact",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    name: "payment_handle",
    reason: "off_platform_payment",
    regex: /\b(paypal\.me|cash\.app|venmo|revolut)\b/i,
  },
  {
    name: "uk_sort_code",
    reason: "off_platform_payment",
    // Strictly 2-2-2 with hyphens to avoid eating ISO dates ("2026-05-28")
    // — but lengths still differ (sort code 2-2-2 vs date 4-2-2) so the
    // bound is enough.
    regex: /\b\d{2}-\d{2}-\d{2}\b/,
  },
  {
    name: "uk_iban",
    reason: "off_platform_payment",
    regex: /\bGB\d{2}[A-Z]{4}\d{14}\b/i,
  },
  {
    name: "off_platform_phrase",
    reason: "off_platform_contact",
    // Common framings: "my number / email / whatsapp", "text me",
    // "call me", "outside the app". Anchored verbs keep the false
    // positive rate low (no naked "number" / "email").
    // "my number" requires a *not-followed-by* word boundary that
    // excludes the idiom "my number one (priority|fan|…)". `email` and
    // `whatsapp` carry no such collision so they stay greedy.
    regex: /\b(my\s+(number(?!\s+one\b)|email|whatsapp)|text\s+me|call\s+me|outside\s+(the\s+)?app)\b/i,
  },
];

/**
 * Scan a message body and return one match per *distinct* pattern that
 * fired. Order is the order patterns are declared above (deterministic
 * for stable flag rows in tests).
 */
export function detectOffPlatform(body: string): {
  matches: ModerationMatch[];
} {
  if (typeof body !== "string" || body.length === 0) {
    return { matches: [] };
  }
  const matches: ModerationMatch[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    if (seen.has(p.name)) continue;
    if (p.regex.test(body)) {
      matches.push({ pattern: p.name, reason: p.reason });
      seen.add(p.name);
    }
  }
  return { matches };
}

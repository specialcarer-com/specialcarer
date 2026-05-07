/**
 * SpecialCarer privacy masking utilities.
 *
 * Family contact PII (full address, phone, email) is sensitive and must
 * NOT be exposed to carers — or visible in admin notification email
 * bodies — until the booking has reached a state where it's required
 * for the work to happen.
 *
 * Lifecycle rule: PII is only revealed once the booking is `paid`.
 *
 *   pending      → job posted, not accepted          → MASK
 *   accepted     → carer accepted, awaiting payment  → MASK
 *   paid         → Stripe payment succeeded          → REVEAL
 *   in_progress  → shift active                      → REVEAL
 *   completed    → shift finished                    → MASK (drop back down)
 *   cancelled    → either party cancelled            → MASK
 *
 * Acceptance is intentionally NOT enough to reveal PII because acceptance
 * is reversible (a carer can drop out before payment) and we don't want
 * PII leaking for bookings that never actually happen.
 *
 * In-app messaging and the masked-VoIP call feature work at every stage,
 * so the carer and family can always communicate without exchanging
 * personal contact details.
 *
 * `replyTo` headers on transactional email keep the real family email
 * available to ops at the SMTP layer (so hitting Reply works) — only
 * the visible body is masked. This is a soft mask, not encryption.
 */

export type BookingStage =
  | "pending"
  | "accepted"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled";

/** Stages at which client PII may be revealed to the matched carer. */
export const REVEAL_STAGES: ReadonlySet<BookingStage> = new Set([
  "paid",
  "in_progress",
]);

/** Returns true when full PII (address, phone, email) may be exposed. */
export function shouldRevealPII(stage: BookingStage | string | null | undefined): boolean {
  return !!stage && REVEAL_STAGES.has(stage as BookingStage);
}

/**
 * Mask the family's full address. Only the postcode (UK) or ZIP (US)
 * is shown until PII is revealed. Falls back to the last comma-separated
 * chunk (commonly the city/state) if no postcode is parseable, or to a
 * generic "(masked until accepted)" string if even that fails.
 */
export function maskAddress(
  address: string | null | undefined,
  country: "GB" | "US",
): string {
  if (!address) return "(not provided)";
  const trimmed = address.trim();
  if (!trimmed) return "(not provided)";
  if (country === "GB") {
    // UK postcode pattern. Covers e.g. SW1A 1AA, NW1 9XB, EC1V 9HX,
    // M1 1AE, B33 8TH, CR2 6XH, DN55 1PT.
    const m = trimmed.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i);
    if (m) return `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
  } else {
    // US ZIP (5-digit or ZIP+4)
    const m = trimmed.match(/\b(\d{5})(-\d{4})?\b/);
    if (m) return m[0];
  }
  // Last-ditch fallback: show only the last comma-separated chunk so we
  // don't expose street + city.
  const parts = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "(masked until accepted)";
}

/**
 * Mask all but the last 4 digits of a phone number, preserving the
 * international dialling prefix (+44, +1) so ops/carers know which
 * country to expect.
 *
 *   "+44 7700 900123"  → "+44 •••• •••0123"
 *   "+1 (415) 555-1234" → "+1 •••• •••1234"
 *   "07700900123"      → "•••• •••0123"
 */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const cc = trimmed.match(/^\+\d{1,3}/);
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length === 0) return "";
  if (digits.length < 4) return "\u2022".repeat(digits.length);
  const last4 = digits.slice(-4);
  const prefix = cc ? `${cc[0]} ` : "";
  return `${prefix}\u2022\u2022\u2022\u2022 \u2022\u2022\u2022${last4}`;
}

/**
 * Mask the local part of an email. Show first + last char of the local
 * part, mask the middle. Domain is preserved so the recipient can see
 * the family is on a personal vs corporate domain.
 *
 *   "jane.doe@gmail.com" → "j••••••e@gmail.com"
 *   "bot@specialcarer.com" → "b••••••t@specialcarer.com"
 *   "a@b.co" → "a•@b.co"
 */
export function maskEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) return `${local[0] || ""}\u2022${domain}`;
  return `${local[0]}\u2022\u2022\u2022\u2022\u2022\u2022${
    local[local.length - 1]
  }${domain}`;
}

/**
 * Convenience: apply the right mask given a booking stage. Returns the
 * value as-is when PII may be revealed, otherwise the masked version.
 *
 * Usage:
 *   const display = revealOrMaskAddress(booking.stage, booking.address, booking.country)
 */
export function revealOrMaskAddress(
  stage: BookingStage | string | null | undefined,
  address: string | null | undefined,
  country: "GB" | "US",
): string {
  if (shouldRevealPII(stage)) return address ?? "(not provided)";
  return maskAddress(address, country);
}

export function revealOrMaskPhone(
  stage: BookingStage | string | null | undefined,
  phone: string | null | undefined,
): string {
  if (shouldRevealPII(stage)) return phone ?? "";
  return maskPhone(phone);
}

export function revealOrMaskEmail(
  stage: BookingStage | string | null | undefined,
  email: string | null | undefined,
): string {
  if (shouldRevealPII(stage)) return email ?? "";
  return maskEmail(email);
}

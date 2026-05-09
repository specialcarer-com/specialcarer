/**
 * Shared types and constants for the review/tip/block flows.
 *
 * The tag list spans the 5 verticals (elderly_care, childcare,
 * special_needs, postnatal, complex_care) so the same chip set works
 * regardless of what the seeker booked.
 */

export const REVIEW_TAG_OPTIONS = [
  { key: "great_with_kids", label: "Great with kids" },
  { key: "above_and_beyond", label: "Above and beyond" },
  { key: "patient", label: "Patient" },
  { key: "punctual", label: "Punctual" },
  { key: "great_communicator", label: "Great communicator" },
  { key: "professional", label: "Professional" },
  { key: "warm_and_caring", label: "Warm and caring" },
  { key: "experienced", label: "Experienced" },
  { key: "trustworthy", label: "Trustworthy" },
  { key: "well_organised", label: "Well organised" },
  { key: "calm_under_pressure", label: "Calm under pressure" },
  { key: "good_with_pets", label: "Good with pets" },
  { key: "tidy", label: "Tidy" },
  { key: "knowledgeable", label: "Knowledgeable" },
] as const;

export type ReviewTagKey = (typeof REVIEW_TAG_OPTIONS)[number]["key"];

export const REVIEW_TAG_KEYS: ReadonlySet<string> = new Set(
  REVIEW_TAG_OPTIONS.map((t) => t.key),
);

export type CategoryKey =
  | "punctuality"
  | "communication"
  | "care_quality"
  | "cleanliness";

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  punctuality: "Punctuality",
  communication: "Communication",
  care_quality: "Care quality",
  cleanliness: "Cleanliness",
};

export const CATEGORY_KEYS: readonly CategoryKey[] = [
  "punctuality",
  "communication",
  "care_quality",
  "cleanliness",
];

export const MAX_TAGS = 5;
export const MAX_PRIVATE_FEEDBACK = 2000;
export const MAX_PUBLIC_BODY = 2000;

export type TipQuickAmount = { amount_cents: number; label: string };

/** Quick-tip presets per currency. Custom amounts go via the API too. */
export const TIP_QUICK_AMOUNTS: Record<"GBP" | "USD", TipQuickAmount[]> = {
  GBP: [
    { amount_cents: 300, label: "£3" },
    { amount_cents: 500, label: "£5" },
    { amount_cents: 1000, label: "£10" },
  ],
  USD: [
    { amount_cents: 500, label: "$5" },
    { amount_cents: 1000, label: "$10" },
    { amount_cents: 2000, label: "$20" },
  ],
};

export const TIP_MIN_CENTS = 100;
export const TIP_MAX_CENTS = 50000;

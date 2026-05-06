// Canonical lists for caregiver profile filter attributes — shared between
// the search filter UI, the dashboard editor, and the API validators.

export const GENDERS = [
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
  { key: "non_binary", label: "Non-binary" },
  { key: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export type GenderKey = (typeof GENDERS)[number]["key"];

export function isGenderKey(g: string | null | undefined): g is GenderKey {
  return !!g && GENDERS.some((x) => x.key === g);
}

// Non-DBS / non-state-criminal credentials carers can claim.
// DBS / right-to-work / digital-id / US criminal / US sanctions are all
// gated separately via `background_checks` (verified by Checkr / etc.).
export const CERTIFICATIONS = [
  { key: "first_aid", label: "First Aid" },
  { key: "paediatric_first_aid", label: "Paediatric First Aid" },
  { key: "cpr_bls", label: "CPR / BLS" },
  { key: "manual_handling", label: "Manual handling" },
  { key: "medication_admin", label: "Medication administration" },
  { key: "dementia_care", label: "Dementia care" },
  { key: "end_of_life", label: "End-of-life / palliative" },
  { key: "team_teach", label: "Team Teach (positive behaviour)" },
  { key: "pecs", label: "PECS (autism communication)" },
  { key: "makaton", label: "Makaton" },
  { key: "peg_tube", label: "PEG / enteral feeding" },
  { key: "tracheostomy", label: "Tracheostomy care" },
  { key: "ventilator", label: "Ventilator care" },
  { key: "epilepsy_buccal", label: "Epilepsy / buccal midazolam" },
  { key: "safeguarding", label: "Safeguarding" },
  { key: "food_hygiene", label: "Food hygiene" },
  { key: "infection_control", label: "Infection prevention & control" },
  { key: "newborn_care", label: "Newborn / postnatal" },
  { key: "breastfeeding_support", label: "Breastfeeding support" },
  { key: "mental_health_first_aid", label: "Mental health first aid" },
] as const;

export type CertificationKey = (typeof CERTIFICATIONS)[number]["key"];

const certLabels: Record<string, string> = Object.fromEntries(
  CERTIFICATIONS.map((c) => [c.key, c.label]),
);

export function certLabel(key: string): string {
  return certLabels[key] ?? key;
}

export function isCertKey(s: string | null | undefined): s is CertificationKey {
  return !!s && CERTIFICATIONS.some((c) => c.key === s);
}

// Free-form lifestyle/preference tags. We surface a curated list in the
// editor but the column is still text[] so carers can add custom ones.
export const SUGGESTED_TAGS = [
  "non-smoker",
  "pet-friendly",
  "comfortable with dogs",
  "comfortable with cats",
  "vegetarian-friendly",
  "vegan-friendly",
  "halal-friendly",
  "kosher-friendly",
  "early-bird",
  "night-owl",
  "school-runs",
  "light-housekeeping",
  "meal-prep",
  "homework-help",
  "cooking",
  "swimming",
  "music-and-singing",
  "arts-and-crafts",
  "outdoor-play",
  "experienced-with-twins",
  "experienced-with-multiples",
  "experienced-with-newborns",
  "experienced-with-dementia",
] as const;

// Minimal validator for free-form tags & languages so we don't store
// junk that breaks layouts.
export function sanitiseFreeText(input: unknown, maxLen = 30, maxItems = 24): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || t.length > maxLen) continue;
    // allow letters/numbers/spaces/hyphens/&
    if (!/^[a-z0-9 \-&\.]+$/i.test(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

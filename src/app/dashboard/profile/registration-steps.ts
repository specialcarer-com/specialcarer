import type { ProfileReadiness } from "@/lib/care/profile";

/** The steps of the carer profile set-up, in order. */
export const STEP_TITLES = [
  "About you",
  "What you do",
  "Area & rates",
  "Extras",
  "Go live",
] as const;

/** Languages offered as tick boxes. Anything else goes in "Other". */
export const LANGUAGE_OPTIONS = [
  "English",
  "Polish",
  "Urdu",
  "Punjabi",
  "Bengali",
  "Hindi",
  "Gujarati",
  "Arabic",
  "Romanian",
  "Portuguese",
  "Spanish",
  "French",
  "Italian",
  "German",
  "Yoruba",
  "Twi",
  "Somali",
] as const;

/** Split saved languages into ticked options and free-text "other" ones. */
export function splitLanguages(saved: readonly string[]): {
  known: string[];
  other: string[];
} {
  const known: string[] = [];
  const other: string[] = [];
  for (const raw of saved) {
    const clean = raw.trim();
    if (!clean) continue;
    const match = LANGUAGE_OPTIONS.find(
      (l) => l.toLowerCase() === clean.toLowerCase(),
    );
    if (match) {
      if (!known.includes(match)) known.push(match);
    } else if (!other.includes(clean)) {
      other.push(clean);
    }
  }
  return { known, other };
}

/**
 * Where a carer should land when they open the editor: the first step that
 * still has something required missing, or the final "Go live" step once the
 * basics are done. A brand-new profile starts at step 0.
 */
export function startingStep(
  r: Pick<
    ProfileReadiness,
    "hasName" | "hasBio" | "hasService" | "hasFormat" | "hasRate" | "hasLocation"
  >,
): number {
  if (!r.hasName || !r.hasBio) return 0;
  if (!r.hasService || !r.hasFormat) return 1;
  if (!r.hasRate || !r.hasLocation) return 2;
  return STEP_TITLES.length - 1;
}

// Carer types — orthogonal to SERVICES (who is cared for). Every caregiver
// declares whether they do live-in work, visiting work, or both. The two
// types differ in how they're paid: live-in is a weekly placement rate;
// visiting is an hourly rate.

export const CARE_FORMATS = [
  {
    key: "live_in",
    label: "Live-in care",
    short: "Live-in",
    href: "/care-formats/live-in",
    rateUnit: "week",
    blurb:
      "A caregiver moves into the home for a placement of several days at a time, providing round-the-clock support. Paid as a weekly rate.",
  },
  {
    key: "visiting",
    label: "Visiting care",
    short: "Visiting",
    href: "/care-formats/visiting",
    rateUnit: "hour",
    blurb:
      "Scheduled visits — from a single hour up to multiple visits a day, on a recurring schedule or one-off. Paid as an hourly rate.",
  },
] as const;

export type CareFormatKey = (typeof CARE_FORMATS)[number]["key"];

const formatLabels: Record<string, string> = Object.fromEntries(
  CARE_FORMATS.map((f) => [f.key, f.label]),
);

export function careFormatLabel(key: string): string {
  return formatLabels[key] ?? key;
}

export function isCareFormatKey(
  s: string | null | undefined,
): s is CareFormatKey {
  return !!s && CARE_FORMATS.some((x) => x.key === s);
}

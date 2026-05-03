// Canonical service tags used on caregiver_profiles.services and the search filter.
// Keep these in sync with the /services/* marketing pages.

export const SERVICES = [
  { key: "elderly_care", label: "Elderly care", href: "/services/elderly-care" },
  { key: "childcare", label: "Childcare", href: "/services/childcare" },
  { key: "special_needs", label: "Special-needs", href: "/services/special-needs" },
  { key: "postnatal", label: "Postnatal & newborn", href: "/services/postnatal" },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];

const labels: Record<string, string> = Object.fromEntries(
  SERVICES.map((s) => [s.key, s.label]),
);

export function serviceLabel(key: string): string {
  return labels[key] ?? key;
}

export function isServiceKey(s: string | null | undefined): s is ServiceKey {
  return !!s && SERVICES.some((x) => x.key === s);
}

export function formatMoney(cents: number, currency: "GBP" | "USD"): string {
  const symbol = currency === "GBP" ? "£" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

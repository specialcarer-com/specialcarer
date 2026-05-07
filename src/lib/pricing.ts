/**
 * Centralised pricing config for SpecialCarer booking products.
 *
 * Visiting (hourly) rates already live in caregiver_profiles.hourly_rate_cents
 * — those come from the carer side and are surfaced through
 * /api/instant-match. This module covers the per-product *floor* prices
 * shown on entry pages, plus the live-in (daily) product which has no
 * carer-side override yet.
 */

export type Country = "GB" | "US";
export type Currency = "GBP" | "USD";

export type RateInfo = {
  rate_cents: number;
  currency: Currency;
  symbol: "£" | "$";
};

/**
 * Floor hourly rates for visiting care, used on the chooser page.
 * Actual prices come from the carer's `hourly_rate_cents` field at
 * booking time — these are display defaults only.
 */
export const VISITING_HOURLY_RATES: Record<Country, RateInfo> = {
  GB: { rate_cents: 1800, currency: "GBP", symbol: "£" },
  US: { rate_cents: 2500, currency: "USD", symbol: "$" },
};

/**
 * Daily rates for live-in care. Live-in is a manual-match product —
 * the rate quoted here is what the API uses to compute the booking
 * total when it inserts a live_in_requests row.
 */
export const LIVE_IN_DAILY_RATES: Record<Country, RateInfo> = {
  GB: { rate_cents: 18000, currency: "GBP", symbol: "£" },
  US: { rate_cents: 25000, currency: "USD", symbol: "$" },
};

/**
 * Multiplier applied to the visiting hourly rate when the shift is
 * tagged as a sleep-in / overnight (8pm–8am). Industry standard is
 * roughly 0.7× for sleep-in shifts.
 */
export const OVERNIGHT_RATE_MULTIPLIER = 0.7;

export function liveInTotalCents(weeks: number, country: Country): number {
  const r = LIVE_IN_DAILY_RATES[country];
  return Math.round(weeks * 7 * r.rate_cents);
}

export function currencySymbol(currency: Currency): "£" | "$" {
  return currency === "USD" ? "$" : "£";
}

export function fmtCurrency(cents: number, currency: Currency): string {
  return `${currencySymbol(currency)}${(cents / 100).toFixed(2)}`;
}

export function fmtCurrencyWhole(cents: number, currency: Currency): string {
  return `${currencySymbol(currency)}${(cents / 100).toFixed(0)}`;
}

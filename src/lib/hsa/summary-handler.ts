/**
 * Pure handler for GET /api/m/family/hsa-summary (gap 33).
 *
 * Returns the caller's HSA/FSA-eligible payments for a given year. The feature
 * is US-only: if the seeker has no USD bookings we return { enabled: false }
 * so the UI can show the "US-only" notice instead of an empty summary.
 *
 * Split out of the route so tests can drive it with a stubbed client without
 * next/headers + cookies (matches the care-plan pdf-handler pattern).
 */
import { NextResponse } from "next/server";

export type HsaSummaryPaymentRow = {
  id: string;
  booking_id: string;
  amount_cents: number;
  paid_at: string | null;
  caregiver_name: string | null;
  /** Current hsa_eligible flag on the row. */
  hsa_eligible: boolean;
};

export type HsaSummaryItem = {
  id: string;
  bookingId: string;
  amountCents: number;
  paidAt: string | null;
  caregiverName: string | null;
  eligible: boolean;
};

export type HsaSummaryClient = {
  /** True when the caller has at least one USD booking (US-based seeker). */
  isUsSeeker(userId: string): Promise<{
    data: boolean;
    error: { message: string } | null;
  }>;
  /**
   * Succeeded payments on the caller's bookings paid within [yearStart, yearEnd).
   * When `eligibleOnly` is true, only hsa_eligible rows are returned (the export
   * view); otherwise every payment is returned so the UI can toggle each one.
   */
  listEligiblePayments(args: {
    userId: string;
    yearStart: string;
    yearEnd: string;
    eligibleOnly: boolean;
  }): Promise<{
    data: HsaSummaryPaymentRow[] | null;
    error: { message: string } | null;
  }>;
};

export type HandleHsaSummaryInput = {
  user_id: string | null;
  year?: number;
  /** When true, return every payment (for the toggle UI), not just eligible. */
  includeAll?: boolean;
  client: HsaSummaryClient;
  now?: Date;
};

/** Sum the amountCents across the items. */
export function sumEligibleCents(items: { amountCents: number }[]): number {
  return items.reduce((acc, it) => acc + (it.amountCents || 0), 0);
}

/** Format integer cents as a USD string, e.g. 12345 -> "$123.45". */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const dollarsStr = dollars.toLocaleString("en-US");
  return `${sign}$${dollarsStr}.${remainder.toString().padStart(2, "0")}`;
}

/** Clamp an arbitrary year input to a sane 4-digit range, defaulting to now. */
export function resolveYear(year: number | undefined, now: Date): number {
  const current = now.getUTCFullYear();
  if (
    typeof year === "number" &&
    Number.isInteger(year) &&
    year >= 2000 &&
    year <= current + 1
  ) {
    return year;
  }
  return current;
}

export async function handleHsaSummary(
  input: HandleHsaSummaryInput,
): Promise<NextResponse> {
  const { user_id, client } = input;
  const now = input.now ?? new Date();

  if (!user_id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const year = resolveYear(input.year, now);

  const us = await client.isUsSeeker(user_id);
  if (us.error) {
    return NextResponse.json(
      { error: "Failed to load account" },
      { status: 500 },
    );
  }
  if (!us.data) {
    return NextResponse.json({ enabled: false });
  }

  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const res = await client.listEligiblePayments({
    userId: user_id,
    yearStart,
    yearEnd,
    eligibleOnly: !input.includeAll,
  });
  if (res.error) {
    return NextResponse.json(
      { error: "Failed to load payments" },
      { status: 500 },
    );
  }

  const payments: HsaSummaryItem[] = (res.data ?? []).map((p) => ({
    id: p.id,
    bookingId: p.booking_id,
    amountCents: p.amount_cents,
    paidAt: p.paid_at,
    caregiverName: p.caregiver_name,
    eligible: p.hsa_eligible,
  }));

  // Totals always reflect eligible-only, regardless of includeAll.
  const eligible = payments.filter((p) => p.eligible);

  return NextResponse.json({
    enabled: true,
    year,
    totalCents: sumEligibleCents(eligible),
    currency: "usd",
    count: eligible.length,
    payments,
  });
}

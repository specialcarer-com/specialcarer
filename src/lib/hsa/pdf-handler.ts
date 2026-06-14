/**
 * Pure handler for GET /api/m/family/hsa-summary.pdf (gap 33).
 *
 * Reuses HsaSummaryClient to load the eligible payments, then renders the
 * one-page summary via renderHsaSummaryPdf and returns it as a PDF response.
 * Non-US seekers get a 403 (the UI only links here when enabled). Mirrors the
 * care-plan pdf-handler so tests can drive it with a stubbed client.
 */
import { NextResponse } from "next/server";
import {
  type HsaSummaryClient,
  type HsaSummaryItem,
  resolveYear,
} from "./summary-handler";
import { renderHsaSummaryPdf } from "./render";

export type HsaPdfClient = HsaSummaryClient & {
  /** Display name of the seeker (account holder), for the PDF header. */
  getSeekerName(userId: string): Promise<string | null>;
};

export type HandleHsaPdfInput = {
  user_id: string | null;
  year?: number;
  client: HsaPdfClient;
  now?: Date;
};

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function handleHsaPdf(
  input: HandleHsaPdfInput,
): Promise<NextResponse> {
  const { user_id, client } = input;
  const now = input.now ?? new Date();

  if (!user_id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const us = await client.isUsSeeker(user_id);
  if (us.error) {
    return NextResponse.json(
      { error: "Failed to load account" },
      { status: 500 },
    );
  }
  if (!us.data) {
    return NextResponse.json(
      { error: "HSA/FSA summary is US-only" },
      { status: 403 },
    );
  }

  const year = resolveYear(input.year, now);
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const res = await client.listEligiblePayments({
    userId: user_id,
    yearStart,
    yearEnd,
    eligibleOnly: true,
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
  const totalCents = payments.reduce((acc, p) => acc + (p.amountCents || 0), 0);
  const seekerName = await client.getSeekerName(user_id);

  const bytes = await renderHsaSummaryPdf({
    year,
    totalCents,
    count: payments.length,
    payments,
    seekerName,
    generatedAt: now,
  });

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="hsa-fsa-summary-${year}-${yyyymmdd(now)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

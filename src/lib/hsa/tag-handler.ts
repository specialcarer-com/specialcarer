/**
 * Pure handler for POST /api/m/payments/[id]/hsa-tag (gap 33).
 *
 * Toggles `hsa_eligible` on a payment the caller paid for. The payer is the
 * seeker on the payment's booking, so we look up the payment + its booking's
 * seeker_id and gate ownership in code. When tagging eligible we stamp
 * hsa_tagged_at = now() and hsa_tagged_by = caller; when un-tagging we clear
 * both.
 *
 * Split out of the route file so tests can drive it with a stubbed client
 * without next/headers + cookies (matches the care-plan pdf-handler pattern).
 */
import { NextResponse } from "next/server";

export type HsaTagPaymentRow = {
  id: string;
  /** seeker_id on the payment's booking — the payer. */
  seeker_id: string;
};

/** Thin DB interface. */
export type HsaTagClient = {
  /** Returns the payment joined to its booking's seeker_id, or null. */
  getPaymentWithPayer(paymentId: string): Promise<{
    data: HsaTagPaymentRow | null;
    error: { message: string } | null;
  }>;
  /** Applies the hsa_eligible toggle + stamps. */
  updateHsaTag(args: {
    paymentId: string;
    eligible: boolean;
    taggedAt: string | null;
    taggedBy: string | null;
  }): Promise<{ error: { message: string } | null }>;
};

export type HandleHsaTagInput = {
  user_id: string | null;
  payment_id: string;
  eligible: unknown;
  client: HsaTagClient;
  now?: Date;
};

export async function handleHsaTag(
  input: HandleHsaTagInput,
): Promise<NextResponse> {
  const { user_id, payment_id, client } = input;
  const now = input.now ?? new Date();

  if (!user_id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (typeof input.eligible !== "boolean") {
    return NextResponse.json(
      { error: "Body must be { eligible: boolean }" },
      { status: 400 },
    );
  }
  const eligible = input.eligible;

  const found = await client.getPaymentWithPayer(payment_id);
  if (found.error) {
    return NextResponse.json(
      { error: "Failed to load payment" },
      { status: 500 },
    );
  }
  if (!found.data) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (found.data.seeker_id !== user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const taggedAt = eligible ? now.toISOString() : null;
  const taggedBy = eligible ? user_id : null;
  const upd = await client.updateHsaTag({
    paymentId: payment_id,
    eligible,
    taggedAt,
    taggedBy,
  });
  if (upd.error) {
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: payment_id,
    hsa_eligible: eligible,
    hsa_tagged_at: taggedAt,
    hsa_tagged_by: taggedBy,
  });
}

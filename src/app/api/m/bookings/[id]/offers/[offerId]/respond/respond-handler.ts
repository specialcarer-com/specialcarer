/**
 * Pure handler for a carer responding to an auto-match offer (gap 17).
 *
 * Body: { action: 'accept' | 'decline', reason?: string }
 *
 * This updates ONLY booking_match_offers.status — it does NOT mutate
 * bookings.caregiver_id. That column is NOT NULL in this schema and the
 * existing booking-acceptance flow remains its single writer. An accepted
 * candidate offer is the signal ops/automation use to lock a carer in
 * (deferred — see migration notes). Keeping the write surface here to the
 * candidate layer is the smaller, safer diff.
 *
 * Driven by a stubbed Supabase client in tests, so no live DB is needed.
 */

export type RespondAction = "accept" | "decline";

export type ParsedRespondBody =
  | { ok: true; action: RespondAction; reason: string | null }
  | { ok: false; error: string };

export function parseRespondBody(body: unknown): ParsedRespondBody {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (action !== "accept" && action !== "decline") {
    return { ok: false, error: "action must be accept or decline" };
  }
  let reason: string | null = null;
  if (action === "decline") {
    if (b.reason != null) {
      if (typeof b.reason !== "string") {
        return { ok: false, error: "reason must be a string" };
      }
      const trimmed = b.reason.trim();
      reason = trimmed.length > 0 ? trimmed.slice(0, 280) : null;
    }
  }
  return { ok: true, action, reason };
}

/** Minimal shape of the offer row the handler reads. */
export type OfferRow = {
  id: string;
  booking_id: string;
  carer_id: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expires_at: string;
};

/**
 * Narrow client surface used by the handler. Lets tests pass a stub that
 * records the update payload without a real Supabase client.
 */
export type RespondClient = {
  loadOffer: (args: {
    offerId: string;
    bookingId: string;
    carerId: string;
  }) => Promise<OfferRow | null>;
  updateOffer: (args: {
    offerId: string;
    status: OfferRow["status"];
    respondedAt: string;
    declineReason: string | null;
  }) => Promise<void>;
};

export type RespondResult =
  | { status: number; body: { ok: true; action: RespondAction } }
  | { status: number; body: { error: string } };

export async function handleRespond(
  client: RespondClient,
  args: {
    bookingId: string;
    offerId: string;
    carerId: string;
    body: unknown;
    now?: number;
  },
): Promise<RespondResult> {
  const parsed = parseRespondBody(args.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }

  const offer = await client.loadOffer({
    offerId: args.offerId,
    bookingId: args.bookingId,
    carerId: args.carerId,
  });
  if (!offer) {
    return { status: 404, body: { error: "Offer not found" } };
  }
  if (offer.status !== "pending") {
    return {
      status: 409,
      body: { error: `Offer is already ${offer.status}` },
    };
  }

  const now = args.now ?? Date.now();
  const nowIso = new Date(now).toISOString();

  // Expired offers can't be accepted/declined; mark them expired and 410.
  const expiresAt = new Date(offer.expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt < now) {
    await client.updateOffer({
      offerId: offer.id,
      status: "expired",
      respondedAt: nowIso,
      declineReason: null,
    });
    return { status: 410, body: { error: "Offer has expired" } };
  }

  const status = parsed.action === "accept" ? "accepted" : "declined";
  await client.updateOffer({
    offerId: offer.id,
    status,
    respondedAt: nowIso,
    declineReason: parsed.action === "decline" ? parsed.reason : null,
  });

  return { status: 200, body: { ok: true, action: parsed.action } };
}

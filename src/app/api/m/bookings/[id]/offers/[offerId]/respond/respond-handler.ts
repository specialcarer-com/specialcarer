/**
 * Pure handler for a carer responding to an auto-match offer (gap 17).
 *
 * Body: { action: 'accept' | 'decline', reason?: string }
 *
 * Accepting now closes the matching loop via the `accept_match_offer` RPC
 * (SECURITY DEFINER, see migration 20260610_offer_accept_booking_confirm.sql):
 *   • "Now" booking (starts within 60 min): first-accept-wins — the RPC
 *     atomically writes bookings.caregiver_id, confirms the booking, and
 *     cancels the other offers. Result is 'instant_confirm' (winner) or
 *     'lost' (lost the race).
 *   • "Scheduled" booking: the offer is marked 'accepted' and the seeker
 *     picks later. Result is 'pending_seeker_pick'.
 *
 * Declining still only flips the offer's own status — no booking mutation.
 *
 * Driven by an injected client in tests, so no live DB is needed.
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
  status:
    | "pending"
    | "accepted"
    | "declined"
    | "expired"
    | "cancelled"
    | "accepted_and_confirmed"
    | "lost";
  expires_at: string;
};

/** The outcome of the accept_match_offer RPC, surfaced to the UI. */
export type AcceptRpcResult = {
  result:
    | "instant_confirm"
    | "lost"
    | "pending_seeker_pick"
    | "expired"
    | "invalid_state";
  booking_id?: string;
  mode?: "now" | "scheduled";
  status?: string;
};

/**
 * Narrow client surface used by the handler. Lets tests pass a stub that
 * records the update payload / RPC call without a real Supabase client.
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
  /** Calls the accept_match_offer RPC and returns its jsonb result. */
  acceptOffer: (args: { offerId: string }) => Promise<AcceptRpcResult>;
  /**
   * Fire-and-forget pushes for the accept outcome. Implementations dispatch
   * job.confirmed / job.lost / booking.confirmed_for_seeker as appropriate.
   */
  onAccepted?: (args: {
    offer: OfferRow;
    rpc: AcceptRpcResult;
  }) => Promise<void> | void;
};

export type RespondResult =
  | {
      status: number;
      body: { ok: true; action: "decline" };
    }
  | {
      status: number;
      body: { ok: true; action: "accept"; outcome: AcceptRpcResult };
    }
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

  if (parsed.action === "decline") {
    await client.updateOffer({
      offerId: offer.id,
      status: "declined",
      respondedAt: nowIso,
      declineReason: parsed.reason,
    });
    return { status: 200, body: { ok: true, action: "decline" } };
  }

  // Accept: delegate to the RPC, which owns the booking mutation + race guard.
  const rpc = await client.acceptOffer({ offerId: offer.id });

  // The offer raced and lost between our SELECT and the RPC's row lock.
  if (rpc.result === "expired") {
    return { status: 410, body: { error: "Offer has expired" } };
  }
  if (rpc.result === "invalid_state") {
    return {
      status: 409,
      body: { error: `Offer is already ${rpc.status ?? "resolved"}` },
    };
  }

  if (client.onAccepted) {
    await client.onAccepted({ offer, rpc });
  }

  return { status: 200, body: { ok: true, action: "accept", outcome: rpc } };
}

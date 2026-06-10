/**
 * Pure handler for a seeker confirming one accepted offer on their own
 * scheduled booking (gap 17 follow-up).
 *
 * Body: { offerId: string }
 *
 * Delegates to the seeker_pick_offer RPC, which (running as the seeker)
 * verifies booking ownership, locks the carer in, and cancels the other live
 * offers. On a successful confirm we push job.confirmed to the chosen carer,
 * booking.confirmed_for_seeker to the seeker, and job.lost to the others.
 *
 * Driven by an injected client in tests, so no live DB is needed.
 */

export type ParsedPickBody =
  | { ok: true; offerId: string }
  | { ok: false; error: string };

export function parsePickBody(body: unknown): ParsedPickBody {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.offerId !== "string" || b.offerId.trim().length === 0) {
    return { ok: false, error: "offerId is required" };
  }
  return { ok: true, offerId: b.offerId };
}

export type PickRpcResult = {
  result: "confirmed" | "already_confirmed" | "invalid_state";
  booking_id?: string;
  carer_id?: string;
  mode?: "scheduled";
  status?: string;
};

export type PickClient = {
  /** Calls seeker_pick_offer as the authenticated seeker. */
  pickOffer: (args: { offerId: string }) => Promise<PickRpcResult>;
  /** Fire-and-forget pushes for a successful confirm. */
  onConfirmed?: (args: {
    offerId: string;
    rpc: PickRpcResult;
  }) => Promise<void> | void;
};

export type PickResult =
  | { status: number; body: { ok: true; outcome: PickRpcResult } }
  | { status: number; body: { error: string } };

export async function handlePick(
  client: PickClient,
  args: { bookingId: string; body: unknown },
): Promise<PickResult> {
  const parsed = parsePickBody(args.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }

  const rpc = await client.pickOffer({ offerId: parsed.offerId });

  if (rpc.result === "invalid_state") {
    return {
      status: 409,
      body: { error: `Offer is ${rpc.status ?? "not pickable"}` },
    };
  }
  if (rpc.result === "already_confirmed") {
    return {
      status: 409,
      body: { error: "This booking is already confirmed" },
    };
  }

  if (client.onConfirmed) {
    await client.onConfirmed({ offerId: parsed.offerId, rpc });
  }

  return { status: 200, body: { ok: true, outcome: rpc } };
}

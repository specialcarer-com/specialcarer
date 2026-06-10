/**
 * POST /api/m/bookings/[id]/offers/[offerId]/respond
 *
 * Carer accepts or declines an auto-match offer (gap 17).
 * Body: { action: 'accept' | 'decline', reason?: string }
 *
 * Accepting closes the matching loop via the accept_match_offer RPC:
 *   • "Now" booking: first-accept-wins — the RPC confirms the booking and
 *     cancels other offers. We then push job.confirmed to the winner,
 *     booking.confirmed_for_seeker to the seeker, and job.lost to the
 *     carers whose offers were cancelled.
 *   • "Scheduled" booking: offer marked 'accepted'; the seeker picks later.
 *
 * Auth: caller must be the offer's carer.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleRespond,
  type AcceptRpcResult,
  type OfferRow,
  type RespondClient,
} from "./respond-handler";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; offerId: string }> },
) {
  const { id: bookingId, offerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const client: RespondClient = {
    async loadOffer({ offerId, bookingId, carerId }) {
      const { data } = await admin
        .from("booking_match_offers")
        .select("id, booking_id, carer_id, status, expires_at")
        .eq("id", offerId)
        .eq("booking_id", bookingId)
        .eq("carer_id", carerId)
        .maybeSingle();
      return (data as OfferRow | null) ?? null;
    },
    async updateOffer({ offerId, status, respondedAt, declineReason }) {
      await admin
        .from("booking_match_offers")
        .update({
          status,
          responded_at: respondedAt,
          decline_reason: declineReason,
        })
        .eq("id", offerId);
    },
    async acceptOffer({ offerId }) {
      // RPC runs as the calling carer (RLS/auth.uid via the user client),
      // owning the booking mutation + race guard atomically.
      const { data, error } = await supabase.rpc("accept_match_offer", {
        p_offer_id: offerId,
      });
      if (error) {
        throw new Error(error.message);
      }
      return data as AcceptRpcResult;
    },
    async onAccepted({ offer, rpc }) {
      if (rpc.result !== "instant_confirm") return;
      await dispatchInstantConfirm(admin, offer);
    },
  };

  const result = await handleRespond(client, {
    bookingId,
    offerId,
    carerId: user.id,
    body,
  });

  return NextResponse.json(result.body, { status: result.status });
}

/**
 * Fan-out pushes after an instant ("Now") confirm: winner gets job.confirmed,
 * seeker gets booking.confirmed_for_seeker, and the carers whose offers were
 * just cancelled get job.lost. Best-effort — never throws into the response.
 */
async function dispatchInstantConfirm(
  admin: ReturnType<typeof createAdminClient>,
  offer: OfferRow,
): Promise<void> {
  try {
    const { dispatch } = await import("@/lib/push/notify");

    const { data: booking } = await admin
      .from("bookings")
      .select("id, seeker_id, starts_at")
      .eq("id", offer.booking_id)
      .maybeSingle();
    const startsAt: string = booking?.starts_at ?? new Date().toISOString();

    // Winner.
    await dispatch({
      type: "job.confirmed",
      bookingId: offer.booking_id,
      carerId: offer.carer_id,
      startsAt,
    });

    // Seeker.
    if (booking?.seeker_id) {
      await dispatch({
        type: "booking.confirmed_for_seeker",
        bookingId: offer.booking_id,
        seekerId: booking.seeker_id,
        startsAt,
      });
    }

    // Losing carers — every offer the RPC just cancelled as filled_by_other_carer.
    const { data: losers } = await admin
      .from("booking_match_offers")
      .select("carer_id")
      .eq("booking_id", offer.booking_id)
      .eq("status", "cancelled")
      .eq("cancel_reason", "filled_by_other_carer");
    for (const row of (losers ?? []) as Array<{ carer_id: string }>) {
      await dispatch({
        type: "job.lost",
        bookingId: offer.booking_id,
        carerId: row.carer_id,
      });
    }
  } catch (err) {
    console.error("[respond] instant-confirm push fan-out failed", err);
  }
}

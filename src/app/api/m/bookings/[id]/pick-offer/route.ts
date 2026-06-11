/**
 * POST /api/m/bookings/[id]/pick-offer
 *
 * Seeker confirms one accepted offer on their own scheduled booking (gap 17).
 * Body: { offerId: string }
 *
 * Auth: caller must be the booking's seeker. Enforced twice — a cheap
 * ownership check here for a clean 403, and authoritatively inside the
 * seeker_pick_offer RPC (auth.uid() = bookings.seeker_id).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handlePick,
  type PickClient,
  type PickRpcResult,
} from "./pick-offer-handler";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cheap ownership pre-check for a friendly 403 (RPC enforces it too).
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, seeker_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.seeker_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const client: PickClient = {
    async pickOffer({ offerId }) {
      const { data, error } = await supabase.rpc("seeker_pick_offer", {
        p_offer_id: offerId,
      });
      if (error) {
        throw new Error(error.message);
      }
      return data as PickRpcResult;
    },
    async onConfirmed({ rpc }) {
      if (rpc.result !== "confirmed" || !rpc.carer_id || !rpc.booking_id) {
        return;
      }
      await dispatchSeekerPick(admin, {
        bookingId: rpc.booking_id,
        winnerCarerId: rpc.carer_id,
        seekerId: user.id,
      });
    },
  };

  try {
    const result = await handlePick(client, { bookingId, body });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "pick_failed";
    if (msg === "not your booking") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Fan-out pushes after a seeker confirms: winner gets job.confirmed, seeker
 * gets booking.confirmed_for_seeker, and the carers whose offers were just
 * cancelled get job.lost. Best-effort — never throws into the response.
 */
async function dispatchSeekerPick(
  admin: ReturnType<typeof createAdminClient>,
  args: { bookingId: string; winnerCarerId: string; seekerId: string },
): Promise<void> {
  try {
    const { dispatch } = await import("@/lib/push/notify");

    const { data: booking } = await admin
      .from("bookings")
      .select("starts_at")
      .eq("id", args.bookingId)
      .maybeSingle();
    const startsAt: string = booking?.starts_at ?? new Date().toISOString();

    await dispatch({
      type: "job.confirmed",
      bookingId: args.bookingId,
      carerId: args.winnerCarerId,
      startsAt,
    });
    await dispatch({
      type: "booking.confirmed_for_seeker",
      bookingId: args.bookingId,
      seekerId: args.seekerId,
      startsAt,
    });

    // Gap 41: family-timeline event for the confirmation. Fire-and-forget.
    try {
      const { recordBookingEvent } = await import("@/lib/timeline/ingest");
      void recordBookingEvent({
        bookingId: args.bookingId,
        transition: "confirmed",
        actorId: args.winnerCarerId,
        adminClient: admin,
      });
    } catch (e) {
      console.error("[pick-offer] timeline event failed", e);
    }

    const { data: losers } = await admin
      .from("booking_match_offers")
      .select("carer_id")
      .eq("booking_id", args.bookingId)
      .eq("status", "cancelled")
      .eq("cancel_reason", "filled_by_other_carer");
    for (const row of (losers ?? []) as Array<{ carer_id: string }>) {
      await dispatch({
        type: "job.lost",
        bookingId: args.bookingId,
        carerId: row.carer_id,
      });
    }
  } catch (err) {
    console.error("[pick-offer] push fan-out failed", err);
  }
}

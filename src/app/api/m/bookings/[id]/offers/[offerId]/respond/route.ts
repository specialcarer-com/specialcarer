/**
 * POST /api/m/bookings/[id]/offers/[offerId]/respond
 *
 * Carer accepts or declines an auto-match candidate offer (gap 17).
 * Body: { action: 'accept' | 'decline', reason?: string }
 *
 * Auth: caller must be the offer's carer. Only updates the candidate offer
 * status — does not write bookings.caregiver_id (see respond-handler notes).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleRespond,
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
  };

  const result = await handleRespond(client, {
    bookingId,
    offerId,
    carerId: user.id,
    body,
  });

  return NextResponse.json(result.body, { status: result.status });
}

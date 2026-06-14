import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDesignatedPayerEnabled } from "@/lib/family/designated-payer-flag";
import {
  handleGetDesignatedPayer,
  handleSetDesignatedPayer,
  type DesignatedPayerClient,
  type DesignatedPayerBookingRow,
} from "@/lib/family/designated-payer-handler";
import type { HouseholdMember } from "@/lib/family/household";

export const dynamic = "force-dynamic";

/**
 * Builds the thin Supabase adapter shared by GET + POST.
 *
 * Reads/writes for the booking column and household lookups go through the
 * admin (service-role) client — the seeker-only authorisation is enforced in
 * the pure handler, and family_members RLS only grants SELECT.
 */
function buildClient(): DesignatedPayerClient {
  const admin = createAdminClient();
  return {
    async getBooking(bookingId) {
      const { data, error } = await admin
        .from("bookings")
        .select("id, seeker_id, designated_payer_user_id")
        .eq("id", bookingId)
        .maybeSingle<DesignatedPayerBookingRow>();
      return { data, error };
    },
    async setDesignatedPayer(bookingId, payerUserId) {
      const { error } = await admin
        .from("bookings")
        .update({ designated_payer_user_id: payerUserId })
        .eq("id", bookingId);
      return { error };
    },
    async getOwnFamilyId(seekerId) {
      const { data, error } = await admin
        .from("families")
        .select("id")
        .eq("primary_user_id", seekerId)
        .maybeSingle<{ id: string }>();
      return { familyId: data?.id ?? null, error };
    },
    async listActiveMembers(familyId) {
      const { data, error } = await admin
        .from("family_members")
        .select("user_id, display_name")
        .eq("family_id", familyId)
        .eq("status", "active")
        .not("user_id", "is", null);
      const members: HouseholdMember[] = (data ?? [])
        .filter((r): r is { user_id: string; display_name: string | null } =>
          Boolean(r.user_id),
        )
        .map((r) => ({ user_id: r.user_id, display_name: r.display_name }));
      return { members, error };
    },
    async getUserName(userId) {
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle<{ full_name: string | null }>();
      return data?.full_name ?? null;
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: booking_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleGetDesignatedPayer({
    user_id: user.id,
    booking_id,
    flagEnabled: isDesignatedPayerEnabled(),
    client: buildClient(),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: booking_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { payerUserId?: unknown };
  try {
    body = (await req.json()) as { payerUserId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return handleSetDesignatedPayer({
    user_id: user.id,
    booking_id,
    payerUserId: body.payerUserId ?? null,
    flagEnabled: isDesignatedPayerEnabled(),
    client: buildClient(),
  });
}

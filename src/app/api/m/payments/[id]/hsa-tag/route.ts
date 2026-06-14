import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleHsaTag,
  type HsaTagClient,
  type HsaTagPaymentRow,
} from "@/lib/hsa/tag-handler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/m/payments/[id]/hsa-tag (gap 33)
 *
 * Body: { eligible: boolean }. Toggles hsa_eligible on a payment the caller
 * paid for (the seeker on the payment's booking). Stamps hsa_tagged_at /
 * hsa_tagged_by when true, clears both when false. 200/400/401/403/404.
 *
 * Ownership is enforced in the handler against the booking's seeker_id; we use
 * the admin client for the lookup + update so RLS can't mask a 403 as a 404.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: payment_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: { eligible?: unknown } = {};
  try {
    body = (await req.json()) as { eligible?: unknown };
  } catch {
    // Leave body empty; handler returns 400 for non-boolean eligible.
  }

  const client: HsaTagClient = {
    async getPaymentWithPayer(id) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("payments")
        .select("id, bookings!inner(seeker_id)")
        .eq("id", id)
        .maybeSingle<{
          id: string;
          bookings: { seeker_id: string } | { seeker_id: string }[];
        }>();
      if (error) return { data: null, error };
      if (!data) return { data: null, error: null };
      const booking = Array.isArray(data.bookings)
        ? data.bookings[0]
        : data.bookings;
      const row: HsaTagPaymentRow = {
        id: data.id,
        seeker_id: booking?.seeker_id ?? "",
      };
      return { data: row, error: null };
    },
    async updateHsaTag({ paymentId, eligible, taggedAt, taggedBy }) {
      const admin = createAdminClient();
      const { error } = await admin
        .from("payments")
        .update({
          hsa_eligible: eligible,
          hsa_tagged_at: taggedAt,
          hsa_tagged_by: taggedBy,
        })
        .eq("id", paymentId);
      return { error };
    },
  };

  return handleHsaTag({
    user_id: user?.id ?? null,
    payment_id,
    eligible: body.eligible,
    client,
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { isDesignatedPayerEnabled } from "@/lib/family/designated-payer-flag";
import {
  handleGetDesignatedPayer,
  handleSetDesignatedPayer,
  type DesignatedPayerClient,
  type DesignatedPayerBookingRow,
} from "@/lib/family/designated-payer-handler";
import type { ReissueAdapter } from "@/lib/family/designated-payer-reissue";
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

/**
 * Builds the Stripe + payments adapter used to re-issue the PaymentIntent when
 * a designated payer is set on a booking that already has one (rollout plan
 * Option B). All reads/writes use the admin client; Stripe calls use the shared
 * server client. The pure re-issue logic lives in designated-payer-reissue.ts.
 */
function buildReissueAdapter(): ReissueAdapter {
  const admin = createAdminClient();
  return {
    async getCurrentIntent(bookingId) {
      // The booking's most recent payment row carries the live PI. Terminal
      // rows (refunded/failed) are not re-issuable; the pure layer guards on
      // the live Stripe status regardless, so we just hand it the latest.
      const { data } = await admin
        .from("payments")
        .select(
          "stripe_payment_intent_id, status, amount_cents, application_fee_cents, currency, destination_account_id, raw",
        )
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{
          stripe_payment_intent_id: string;
          amount_cents: number;
          application_fee_cents: number;
          currency: string;
          destination_account_id: string;
          raw: Record<string, unknown> | null;
        }>();
      if (!data?.stripe_payment_intent_id) return null;

      // Read the authoritative status live from Stripe (the payments row only
      // reflects the latest webhook, which may lag the actual PI state).
      let liveStatus: string;
      let liveMetadata: Record<string, string> = {};
      try {
        const pi = await stripe.paymentIntents.retrieve(
          data.stripe_payment_intent_id,
        );
        liveStatus = pi.status;
        liveMetadata = (pi.metadata ?? {}) as Record<string, string>;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err && typeof err === "object" && "code" in err &&
          typeof (err as { code: unknown }).code === "string"
            ? (err as { code: string }).code
            : "stripe_retrieve_failed";
        console.warn(
          JSON.stringify({
            event: "designated_payer_intent_retrieve_failed",
            bookingId,
            paymentIntentId: data.stripe_payment_intent_id,
            message,
            code,
          }),
        );
        throw Object.assign(
          new Error(`Stripe PaymentIntent retrieve failed: ${message}`),
          { phase: "retrieve", code },
        );
      }

      return {
        paymentIntentId: data.stripe_payment_intent_id,
        status: liveStatus,
        amountCents: data.amount_cents,
        currency: data.currency,
        metadata: liveMetadata,
        applicationFeeCents: data.application_fee_cents,
        destinationAccountId: data.destination_account_id,
      };
    },
    async getSavedPaymentMethod(payerUserId) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", payerUserId)
        .not("stripe_customer_id", "is", null)
        .limit(1)
        .maybeSingle<{ stripe_customer_id: string | null }>();
      const customerId = sub?.stripe_customer_id;
      if (!customerId) return null;
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) return null;
        const defaultPm = customer.invoice_settings?.default_payment_method;
        const paymentMethodId =
          typeof defaultPm === "string" ? defaultPm : defaultPm?.id ?? null;
        if (!paymentMethodId) return null;
        return { stripeCustomerId: customerId, paymentMethodId };
      } catch (err) {
        console.warn(
          "[designated-payer] failed to load payer payment method",
          err,
        );
        return null;
      }
    },
    async cancelIntent(paymentIntentId) {
      await stripe.paymentIntents.cancel(paymentIntentId);
    },
    async createIntent(input) {
      const intent = await stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: input.currency,
        capture_method: "manual",
        application_fee_amount: input.applicationFeeCents,
        transfer_data: { destination: input.destinationAccountId },
        customer: input.customer,
        payment_method: input.paymentMethod,
        off_session: true,
        confirm: false,
        metadata: input.metadata,
      });
      return { id: intent.id };
    },
    async persistNewIntent({
      bookingId,
      oldPaymentIntentId,
      newPaymentIntentId,
      amountCents,
      applicationFeeCents,
      currency,
      destinationAccountId,
    }) {
      const now = new Date().toISOString();
      // Mark the cancelled intent's row, then point the booking at the new PI.
      const { error: updateError } = await admin
        .from("payments")
        .update({ status: "cancelled", updated_at: now })
        .eq("booking_id", bookingId)
        .eq("stripe_payment_intent_id", oldPaymentIntentId);
      if (updateError) {
        throw Object.assign(
          new Error(
            `Failed to mark old payment cancelled: ${updateError.message}`,
          ),
          { phase: "persist", code: updateError.code ?? "db_update_failed" },
        );
      }
      const { error: insertError } = await admin.from("payments").insert({
        booking_id: bookingId,
        stripe_payment_intent_id: newPaymentIntentId,
        status: "requires_payment_method",
        amount_cents: amountCents,
        application_fee_cents: applicationFeeCents,
        currency,
        destination_account_id: destinationAccountId,
      });
      if (insertError) {
        throw Object.assign(
          new Error(`Failed to insert new payment row: ${insertError.message}`),
          { phase: "persist", code: insertError.code ?? "db_insert_failed" },
        );
      }
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
    reissue: buildReissueAdapter(),
  });
}

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import BookingTrackingClient from "./tracking-client";
import MessagesPanel from "./messages-panel";
import BookingActions from "./booking-actions";
import ReviewPanel from "./review-panel";
import { CARER_FEE_PERCENT } from "@/lib/fees/config";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Booking — SpecialCarer",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Awaiting payment",
  paid: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  paid_out: "Paid out",
  cancelled: "Cancelled",
  refunded: "Refunded",
  disputed: "Disputed",
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, total_cents, subtotal_cents, platform_fee_cents, currency, location_city, location_country, paid_at, shift_completed_at, payout_eligible_at, paid_out_at, service_type, notes",
    )
    .eq("id", id)
    .maybeSingle();
  if (!booking) notFound();

  const isSeeker = booking.seeker_id === user.id;
  const isCaregiver = booking.caregiver_id === user.id;
  if (!isSeeker && !isCaregiver) notFound();

  const otherId = isSeeker ? booking.caregiver_id : booking.seeker_id;
  const { data: otherProfile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", otherId)
    .maybeSingle();

  // Existing review (if seeker)
  let existingReview: { rating: number; body: string | null } | null = null;
  if (isSeeker) {
    const { data } = await admin
      .from("reviews")
      .select("rating, body")
      .eq("booking_id", id)
      .eq("reviewer_id", user.id)
      .maybeSingle();
    if (data) existingReview = { rating: data.rating, body: data.body };
  }

  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const trackingWindowEnd = new Date(endsAt.getTime() + 15 * 60_000);
  const now = new Date();
  const trackingWindowOpen =
    now.getTime() >= startsAt.getTime() - 15 * 60_000 &&
    now.getTime() <= trackingWindowEnd.getTime();

  const currencySymbol = booking.currency?.toLowerCase() === "usd" ? "$" : "£";
  const total = (booking.total_cents ?? 0) / 100;
  // Carer take-home: subtotal − carer-side deduction (CARER_FEE_PERCENT).
  const carerPayoutCents =
    (booking.subtotal_cents ?? 0) -
    Math.round(((booking.subtotal_cents ?? 0) * CARER_FEE_PERCENT) / 100);
  const carerPayout = carerPayoutCents / 100;
  const displayAmount = isCaregiver ? carerPayout : total;
  const displayLabel = isCaregiver ? "take-home" : "";

  const role = isCaregiver ? "caregiver" : "seeker";
  const reviewable =
    isSeeker && ["completed", "paid_out"].includes(booking.status);

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <span className="text-sm text-slate-600 hidden sm:inline">
            {user.email}
          </span>
        </div>
      </header>

      <section className="flex-1 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to dashboard
          </Link>

          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              Shift on {startsAt.toLocaleDateString()}
            </h1>
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
              {STATUS_LABEL[booking.status] ?? booking.status}
            </span>
          </div>
          <p className="mt-1 text-slate-600">
            {startsAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {" – "}
            {endsAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {booking.hours} hours · {currencySymbol}
            {displayAmount.toFixed(2)}
            {displayLabel && (
              <span className="ml-1 text-xs text-slate-500">{displayLabel}</span>
            )}
          </p>

          <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-100 grid sm:grid-cols-2 gap-4 text-sm">
            <Row label={isCaregiver ? "Family" : "Caregiver"}>
              {isSeeker && booking.caregiver_id ? (
                <Link
                  href={`/caregiver/${booking.caregiver_id}`}
                  className="text-brand-700 hover:underline"
                >
                  {otherProfile?.full_name ?? "—"}
                </Link>
              ) : (
                otherProfile?.full_name ?? "—"
              )}
            </Row>
            <Row label="Service">{booking.service_type ?? "—"}</Row>
            <Row label="Location">
              {booking.location_city ?? "—"}
              {booking.location_country ? `, ${booking.location_country}` : ""}
            </Row>
            <Row label="Paid">{booking.paid_at ? "Yes" : "Pending"}</Row>
            {booking.notes && (
              <div className="sm:col-span-2">
                <div className="text-slate-500">Notes from family</div>
                <div className="font-medium mt-0.5 whitespace-pre-line">
                  {booking.notes}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <BookingActions
            bookingId={booking.id}
            status={booking.status}
            role={role}
          />

          <BookingTrackingClient
            bookingId={booking.id}
            role={role}
            scheduledStart={booking.starts_at}
            scheduledEnd={booking.ends_at}
            trackingWindowEnd={trackingWindowEnd.toISOString()}
            initiallyOpen={trackingWindowOpen}
            paid={!!booking.paid_at}
          />

          {/* Review (seeker only, post-shift) */}
          {reviewable && (
            <ReviewPanel
              bookingId={booking.id}
              caregiverName={otherProfile?.full_name ?? "your caregiver"}
              existing={existingReview}
            />
          )}

          {/* Messages */}
          <MessagesPanel
            bookingId={booking.id}
            currentUserId={user.id}
            counterpartyName={otherProfile?.full_name ?? "the other party"}
          />
        </div>
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="font-medium mt-0.5">{children}</div>
    </div>
  );
}

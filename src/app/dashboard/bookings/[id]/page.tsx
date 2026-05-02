import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BookingTrackingClient from "./tracking-client";

export const metadata = {
  title: "Booking — SpecialCarer",
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

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, total_cents, currency, location_city, location_country, paid_at, shift_completed_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!booking) notFound();

  const isSeeker = booking.seeker_id === user.id;
  const isCaregiver = booking.caregiver_id === user.id;
  if (!isSeeker && !isCaregiver) notFound();

  const { data: caregiverProfile } = booking.caregiver_id
    ? await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", booking.caregiver_id)
        .maybeSingle()
    : { data: null };

  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const trackingWindowEnd = new Date(endsAt.getTime() + 15 * 60_000);
  const now = new Date();
  const trackingWindowOpen =
    now.getTime() >= startsAt.getTime() - 15 * 60_000 &&
    now.getTime() <= trackingWindowEnd.getTime();

  const currencySymbol = booking.currency?.toLowerCase() === "usd" ? "$" : "£";
  const total = (booking.total_cents ?? 0) / 100;

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white font-bold">
              S
            </div>
            <span className="font-semibold text-lg">SpecialCarer</span>
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Shift on {startsAt.toLocaleDateString()}
          </h1>
          <p className="mt-1 text-slate-600">
            {startsAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            –{" "}
            {endsAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {booking.hours} hours · {currencySymbol}
            {total.toFixed(2)}
          </p>

          <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-100 grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Caregiver</div>
              <div className="font-medium">
                {caregiverProfile?.full_name ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Status</div>
              <div className="font-medium capitalize">{booking.status}</div>
            </div>
            <div>
              <div className="text-slate-500">Location</div>
              <div className="font-medium">
                {booking.location_city ?? "—"}
                {booking.location_country ? `, ${booking.location_country}` : ""}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Paid</div>
              <div className="font-medium">
                {booking.paid_at ? "Yes" : "Pending"}
              </div>
            </div>
          </div>

          <BookingTrackingClient
            bookingId={booking.id}
            role={isCaregiver ? "caregiver" : "seeker"}
            scheduledStart={booking.starts_at}
            scheduledEnd={booking.ends_at}
            trackingWindowEnd={trackingWindowEnd.toISOString()}
            initiallyOpen={trackingWindowOpen}
            paid={!!booking.paid_at}
          />
        </div>
      </section>
    </main>
  );
}

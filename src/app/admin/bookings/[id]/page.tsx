import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBookingDetail,
  fmtMoney,
  fmtDateTime,
  statusTone,
  type BookingStatus,
} from "@/lib/admin/bookings";
import BookingActions from "./_components/BookingActions";
import { CLIENT_FEE_PERCENT, CARER_FEE_PERCENT } from "@/lib/fees/config";

export const dynamic = "force-dynamic";

export default async function AdminBookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getBookingDetail(id);
  if (!data) notFound();

  const { booking, seeker, caregiver, payment } = data;
  const status = booking.status as BookingStatus;
  const tone = statusTone(status);
  const currency = booking.currency as "gbp" | "usd";

  const canForceRelease = ["completed", "in_progress", "paid"].includes(status);
  const canRefund = [
    "paid",
    "in_progress",
    "completed",
    "paid_out",
    "disputed",
  ].includes(status);
  const canDispute = status !== "disputed" && status !== "cancelled";

  // Build a chronological timeline from the booking timestamps
  type Step = { at: string; label: string; tone?: "ok" | "warn" | "err" };
  const steps: Step[] = [
    { at: booking.created_at, label: "Booking created" },
  ];
  if (booking.paid_at) steps.push({ at: booking.paid_at, label: "Payment authorized", tone: "ok" });
  if (booking.shift_completed_at)
    steps.push({ at: booking.shift_completed_at, label: "Shift marked complete", tone: "ok" });
  if (booking.payout_eligible_at)
    steps.push({
      at: booking.payout_eligible_at,
      label: "Payout hold ends (24h)",
    });
  if (booking.paid_out_at)
    steps.push({ at: booking.paid_out_at, label: "Funds released to caregiver", tone: "ok" });
  if (booking.cancelled_at)
    steps.push({ at: booking.cancelled_at, label: "Cancelled", tone: "err" });
  if (booking.refunded_at)
    steps.push({ at: booking.refunded_at, label: "Refunded", tone: "err" });
  steps.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/bookings"
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          ← All bookings
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Booking{" "}
              <span className="font-mono text-base text-slate-500">
                {booking.id.slice(0, 8)}…
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {booking.service_type ?? "—"} · {booking.location_city ?? "—"}
              {booking.location_country && ` · ${booking.location_country}`}
            </p>
          </div>
          <span
            className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-md ${tone.cls}`}
          >
            {tone.label}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Money
          </h2>
          {/*
            Split fee model:
              subtotal     = listed rate × hours              (carer's gross)
              client fee   = subtotal × CLIENT_FEE_PERCENT    (added on top)
              total        = subtotal + client fee            (client pays)
              carer fee    = subtotal × CARER_FEE_PERCENT     (taken from carer)
              carer payout = subtotal − carer fee
              platform_fee = client fee + carer fee           (combined platform take)
          */}
          {(() => {
            const sub = booking.subtotal_cents ?? 0;
            const clientFee = Math.round((sub * CLIENT_FEE_PERCENT) / 100);
            const carerFee = Math.round((sub * CARER_FEE_PERCENT) / 100);
            const carerPct = 100 - CARER_FEE_PERCENT;
            return (
              <dl className="space-y-2 text-sm">
                <Row
                  k="Hourly rate"
                  v={fmtMoney(booking.hourly_rate_cents, currency)}
                />
                <Row k="Hours" v={String(booking.hours)} />
                <Row
                  k="Carer subtotal"
                  v={fmtMoney(sub, currency)}
                />
                {CLIENT_FEE_PERCENT > 0 && (
                  <Row
                    k={`Client fee (+${CLIENT_FEE_PERCENT}%)`}
                    v={`+ ${fmtMoney(clientFee, currency)}`}
                  />
                )}
                <Row
                  k="Client paid"
                  v={fmtMoney(booking.total_cents, currency)}
                />
                <Row
                  k={`Carer fee (−${CARER_FEE_PERCENT}%)`}
                  v={`− ${fmtMoney(carerFee, currency)}`}
                />
                <Row
                  k={`Carer payout (${carerPct}%)`}
                  v={fmtMoney(sub - carerFee, currency)}
                />
                <Row
                  k="Platform total"
                  v={fmtMoney(booking.platform_fee_cents, currency)}
                />
                <Row k="Currency" v={currency.toUpperCase()} />
              </dl>
            );
          })()}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Schedule
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="Starts" v={fmtDateTime(booking.starts_at)} />
            <Row k="Ends" v={fmtDateTime(booking.ends_at)} />
            <Row k="Created" v={fmtDateTime(booking.created_at)} />
            <Row k="Updated" v={fmtDateTime(booking.updated_at)} />
          </dl>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Seeker
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="Name" v={seeker.name ?? "—"} />
            <Row k="Email" v={seeker.email ?? "—"} />
            <Row k="Country" v={seeker.country ?? "—"} />
            <Row k="Phone" v={seeker.phone ?? "—"} />
          </dl>
          <Link
            href={`/admin/users/${seeker.id}`}
            className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
          >
            View seeker profile →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            Caregiver
          </h2>
          <dl className="space-y-2 text-sm">
            <Row k="Name" v={caregiver.name ?? "—"} />
            <Row k="Email" v={caregiver.email ?? "—"} />
            <Row k="Country" v={caregiver.country ?? "—"} />
            <Row k="Phone" v={caregiver.phone ?? "—"} />
          </dl>
          <Link
            href={`/admin/users/${caregiver.id}`}
            className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
          >
            View caregiver profile →
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
          Payment
        </h2>
        {payment ? (
          <dl className="space-y-2 text-sm">
            <Row k="Status" v={payment.status as string} />
            <Row k="PaymentIntent" v={payment.stripe_payment_intent_id ?? "—"} mono />
            <Row k="Charge ID" v={payment.stripe_charge_id ?? "—"} mono />
            <Row
              k="Application fee"
              v={
                payment.application_fee_cents != null
                  ? fmtMoney(payment.application_fee_cents, currency)
                  : "—"
              }
            />
            <Row
              k="Destination account"
              v={payment.destination_account_id ?? "—"}
              mono
            />
          </dl>
        ) : (
          <p className="text-sm text-slate-500">
            No payment record yet (booking has not been paid).
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
          Timeline
        </h2>
        <ol className="space-y-2 text-sm">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className={`mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                  s.tone === "ok"
                    ? "bg-emerald-500"
                    : s.tone === "err"
                      ? "bg-rose-500"
                      : "bg-slate-400"
                }`}
              />
              <div>
                <div className="text-slate-900">{s.label}</div>
                <div className="text-xs text-slate-500">{fmtDateTime(s.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-slate-500">
          Admin actions
        </h2>
        <BookingActions
          bookingId={booking.id}
          canForceRelease={canForceRelease}
          canRefund={canRefund}
          canDispute={canDispute}
        />
        <p className="text-xs text-slate-400">
          All actions require a reason and are recorded in the audit log.
        </p>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd
        className={`text-slate-900 text-right ${
          mono ? "font-mono text-xs break-all" : ""
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe/client";

type Currency = "gbp" | "usd";
type ServiceType = "childcare" | "elderly" | "home_support" | "special_needs";

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "childcare", label: "Childcare" },
  { value: "elderly", label: "Elderly care" },
  { value: "home_support", label: "Home support" },
  { value: "special_needs", label: "Special needs" },
];

const CURRENCY_SYMBOL: Record<Currency, string> = { gbp: "£", usd: "$" };

function fmtMoney(cents: number, currency: Currency) {
  return `${CURRENCY_SYMBOL[currency]}${(cents / 100).toFixed(2)}`;
}

function combineDateTime(date: string, time: string): string {
  // Returns ISO string in user's local TZ
  return new Date(`${date}T${time}`).toISOString();
}

export default function BookingForm({
  caregiverId,
  caregiverName,
  defaultCurrency,
}: {
  caregiverId: string;
  caregiverName: string;
  defaultCurrency: Currency;
}) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  const tomorrowStr = `${yyyy}-${mm}-${dd}`;

  const [serviceType, setServiceType] = useState<ServiceType>("childcare");
  const [date, setDate] = useState(tomorrowStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [hourlyRate, setHourlyRate] = useState(20);
  const [currency] = useState<Currency>(defaultCurrency);
  const [notes, setNotes] = useState("");

  const [stage, setStage] = useState<"details" | "payment" | "success">(
    "details"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const hours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const minutes = (eh * 60 + em) - (sh * 60 + sm);
    return minutes > 0 ? minutes / 60 : 0;
  }, [startTime, endTime]);

  const subtotalCents = Math.round(hours * hourlyRate * 100);
  const platformFeeCents = Math.round(subtotalCents * 0.2);
  const totalCents = subtotalCents + platformFeeCents;

  async function handleStartPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (hours <= 0) {
      setError("Shift end time must be after start time.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stripe/create-booking-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caregiver_id: caregiverId,
          starts_at: combineDateTime(date, startTime),
          ends_at: combineDateTime(date, endTime),
          hours,
          hourly_rate_cents: hourlyRate * 100,
          currency,
          service_type: serviceType,
          notes: notes || undefined,
          location_country: currency === "usd" ? "US" : "GB",
        }),
      });
      const json = (await res.json()) as {
        client_secret?: string;
        booking_id?: string;
        error?: string;
      };
      if (!res.ok || !json.client_secret) {
        throw new Error(json.error ?? "Could not start payment");
      }
      setClientSecret(json.client_secret);
      setBookingId(json.booking_id ?? null);
      setStage("payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "success") {
    return (
      <div className="mt-8 p-6 rounded-2xl bg-emerald-50 border border-emerald-200">
        <h2 className="text-xl font-semibold text-emerald-900">
          Booking confirmed
        </h2>
        <p className="mt-2 text-emerald-900/80 text-sm">
          We&rsquo;ve authorized {fmtMoney(totalCents, currency)} on your card
          and held it securely. Once the shift ends, we wait 24 hours, then
          release {fmtMoney(subtotalCents, currency)} to {caregiverName}.
          You&rsquo;ll see a receipt in your email.
        </p>
        <p className="mt-3 text-xs text-emerald-900/60 font-mono">
          Booking ID: {bookingId}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <form
        onSubmit={handleStartPayment}
        className={stage === "details" ? "space-y-4" : "hidden"}
      >
        <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
          <h2 className="font-semibold">Shift details</h2>

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Service</span>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-slate-700 font-medium">Start time</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700 font-medium">End time</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">
              Hourly rate ({CURRENCY_SYMBOL[currency]})
            </span>
            <input
              type="number"
              min={5}
              max={200}
              step={1}
              value={hourlyRate}
              onChange={(e) => setHourlyRate(Number(e.target.value))}
              required
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
              placeholder="Anything the caregiver should know"
            />
          </label>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200">
          <h2 className="font-semibold">Summary</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row
              label={`${hours.toFixed(1)} h × ${fmtMoney(hourlyRate * 100, currency)}`}
              value={fmtMoney(subtotalCents, currency)}
            />
            <Row
              label="Platform fee (20%)"
              value={fmtMoney(platformFeeCents, currency)}
            />
            <Row
              label="Total"
              value={fmtMoney(totalCents, currency)}
              bold
            />
          </dl>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || hours <= 0}
          className="w-full px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Preparing payment…" : "Continue to payment"}
        </button>
      </form>

      {stage === "payment" && clientSecret && (
        <Elements
          stripe={getStripe()}
          options={{
            clientSecret,
            appearance: APPEARANCE,
          }}
        >
          <PaymentStep
            totalCents={totalCents}
            subtotalCents={subtotalCents}
            currency={currency}
            caregiverName={caregiverName}
            onSuccess={() => setStage("success")}
            onBack={() => setStage("details")}
          />
        </Elements>
      )}
    </div>
  );
}

const APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#0d9488",
    colorBackground: "#ffffff",
    borderRadius: "12px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
};

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${bold ? "font-semibold pt-2 border-t border-slate-100" : "text-slate-600"}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PaymentStep({
  totalCents,
  subtotalCents,
  currency,
  caregiverName,
  onSuccess,
  onBack,
}: {
  totalCents: number;
  subtotalCents: number;
  currency: Currency;
  caregiverName: string;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErr(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // We don't redirect to a URL — we use redirect:"if_required" and
        // handle success inline.
      },
      redirect: "if_required",
    });

    if (error) {
      setErr(error.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }
    onSuccess();
  }

  return (
    <form
      onSubmit={handlePay}
      className="space-y-4 p-5 rounded-2xl bg-white border border-slate-200"
    >
      <h2 className="font-semibold">Payment</h2>
      <p className="text-sm text-slate-600">
        Authorizing {fmtMoney(totalCents, currency)}. We hold these funds until
        24 hours after your shift completes, then release{" "}
        {fmtMoney(subtotalCents, currency)} to {caregiverName}.
      </p>

      <PaymentElement />

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting || !stripe}
          className="flex-1 px-4 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Processing…" : `Authorize ${fmtMoney(totalCents, currency)}`}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Test card: 4242 4242 4242 4242 · any future expiry · any CVC · any ZIP
      </p>
    </form>
  );
}

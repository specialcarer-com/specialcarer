"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe/client";
import { CERTIFICATIONS, GENDERS } from "@/lib/care/attributes";

type Currency = "gbp" | "usd";
// Aligned with src/lib/care/services.ts so caregiver listings, search,
// and booking all use the same vertical taxonomy.
type ServiceType =
  | "elderly_care"
  | "childcare"
  | "special_needs"
  | "postnatal"
  | "complex_care";

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "elderly_care", label: "Elderly care" },
  { value: "childcare", label: "Childcare" },
  { value: "special_needs", label: "Special-needs" },
  { value: "postnatal", label: "Postnatal & newborn" },
  { value: "complex_care", label: "Complex care" },
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
  defaultHourlyRate = 20,
}: {
  caregiverId: string;
  caregiverName: string;
  defaultCurrency: Currency;
  defaultHourlyRate?: number;
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
  const [hourlyRate, setHourlyRate] = useState(defaultHourlyRate);
  const [currency] = useState<Currency>(defaultCurrency);
  const [notes, setNotes] = useState("");
  const [locationPostcode, setLocationPostcode] = useState("");

  // Allow query-param prefill so /book/instant (and other entry points) can
  // deep-link straight into a payment-ready booking form.
  const sp = useSearchParams();
  // Whether this booking originated from the Instant flow — used to flag
  // the booking server-side so the carer is notified immediately.
  const [isInstant, setIsInstant] = useState(false);
  useEffect(() => {
    if (!sp) return;
    const qSvc = sp.get("service");
    if (
      qSvc === "elderly_care" ||
      qSvc === "childcare" ||
      qSvc === "special_needs" ||
      qSvc === "postnatal" ||
      qSvc === "complex_care"
    ) {
      setServiceType(qSvc);
    }
    const qDate = sp.get("date");
    if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) setDate(qDate);
    const qStart = sp.get("start");
    if (qStart && /^\d{2}:\d{2}$/.test(qStart)) setStartTime(qStart);
    const qEnd = sp.get("end");
    if (qEnd && /^\d{2}:\d{2}$/.test(qEnd)) setEndTime(qEnd);
    const qPostcode = sp.get("postcode");
    if (qPostcode) setLocationPostcode(qPostcode);
    if (sp.get("instant") === "1") setIsInstant(true);
    // intentionally only on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional booking preferences — recorded against the booking so the
  // carer (and our admin) can see what the family asked for at request time.
  const [prefGenders, setPrefGenders] = useState<string[]>([]);
  const [prefDriver, setPrefDriver] = useState(false);
  const [prefVehicle, setPrefVehicle] = useState(false);
  const [prefCerts, setPrefCerts] = useState<string[]>([]);
  const [prefLangs, setPrefLangs] = useState("");
  const [prefTags, setPrefTags] = useState("");

  function togglePrefGender(k: string) {
    setPrefGenders((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }
  function togglePrefCert(k: string) {
    setPrefCerts((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

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
  const platformFeeCents = Math.round(subtotalCents * 0.3);
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
          location_postcode: locationPostcode.trim() || undefined,
          preferences: {
            genders: prefGenders,
            require_driver: prefDriver,
            require_vehicle: prefVehicle,
            required_certifications: prefCerts,
            required_languages: prefLangs
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            tags: prefTags
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean),
          },
          is_instant: isInstant,
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
            <span className="text-slate-700 font-medium">
              {currency === "usd" ? "Care location ZIP" : "Care location postcode"}
            </span>
            <input
              type="text"
              value={locationPostcode}
              onChange={(e) => setLocationPostcode(e.target.value.toUpperCase())}
              autoComplete="postal-code"
              maxLength={10}
              placeholder={currency === "usd" ? "10001" : "SW1A 1AA"}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Where the carer should arrive. Full address is exchanged once the booking is confirmed.
            </span>
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

          <details className="group rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 list-none flex items-center gap-1.5">
              <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
              Match preferences (optional)
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              These help us flag a better match if you ever change carer.
              They&rsquo;re saved against this booking and shared with the carer.
            </p>

            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-slate-700">Gender</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {GENDERS.map((g) => {
                  const on = prefGenders.includes(g.key);
                  return (
                    <button
                      type="button"
                      key={g.key}
                      onClick={() => togglePrefGender(g.key)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                        on
                          ? "bg-brand text-white border-brand"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-slate-700">Travel</legend>
              <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefDriver}
                    onChange={(e) => setPrefDriver(e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  Driver&rsquo;s licence
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={prefVehicle}
                    onChange={(e) => setPrefVehicle(e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  Has own vehicle
                </label>
              </div>
            </fieldset>

            <fieldset className="mt-3">
              <legend className="text-xs font-semibold text-slate-700">Certifications</legend>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CERTIFICATIONS.map((c) => {
                  const on = prefCerts.includes(c.key);
                  return (
                    <button
                      type="button"
                      key={c.key}
                      onClick={() => togglePrefCert(c.key)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition ${
                        on
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs">
                <span className="font-semibold text-slate-700">Languages</span>
                <input
                  type="text"
                  value={prefLangs}
                  onChange={(e) => setPrefLangs(e.target.value)}
                  placeholder="Polish, Urdu"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="font-semibold text-slate-700">Tags</span>
                <input
                  type="text"
                  value={prefTags}
                  onChange={(e) => setPrefTags(e.target.value)}
                  placeholder="non-smoker, pet-friendly"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                />
              </label>
            </div>
          </details>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200">
          <h2 className="font-semibold">Summary</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row
              label={`${hours.toFixed(1)} h × ${fmtMoney(hourlyRate * 100, currency)}`}
              value={fmtMoney(subtotalCents, currency)}
            />
            <Row
              label="Platform fee (30%)"
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

"use client";

/**
 * Live-in care request form. Live-in is a manual-match product:
 * the form posts to /api/bookings/live-in/request which records the
 * request and emails admins. No payment is taken upfront.
 *
 * Surface "web" = used inside MarketingShell on /book/live-in.
 * Surface "mobile" = used inside the /m/* shell on /m/book/live-in.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  LIVE_IN_DAILY_RATES,
  liveInTotalCents,
  fmtCurrencyWhole,
  type Country,
} from "@/lib/pricing";

type Surface = "web" | "mobile";

type ServiceType =
  | "elderly_care"
  | "childcare"
  | "special_needs"
  | "postnatal"
  | "complex_care";

const SERVICES: { value: ServiceType; label: string }[] = [
  { value: "elderly_care", label: "Elderly care" },
  { value: "childcare", label: "Childcare" },
  { value: "special_needs", label: "Special-needs" },
  { value: "postnatal", label: "Postnatal" },
  { value: "complex_care", label: "Complex care" },
];

const WEEK_PRESETS = [1, 2, 4, 8, 12] as const;

const MIN_LEAD_DAYS = 7; // DBS placement processing window.

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function LiveInForm({
  surface,
  defaultCountry,
}: {
  surface: Surface;
  defaultCountry: Country;
}) {
  const minDateISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + MIN_LEAD_DAYS);
    return localDateStr(d);
  }, []);

  const [service, setService] = useState<ServiceType>("elderly_care");
  const [startDate, setStartDate] = useState(minDateISO);
  const [weeks, setWeeks] = useState<number>(4);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [country] = useState<Country>(defaultCountry);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const rate = LIVE_IN_DAILY_RATES[country];
  const totalCents = liveInTotalCents(weeks, country);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings/live-in/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          start_date: startDate,
          weeks,
          address,
          notes,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          country,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setErrMsg(prettyError(json.error));
        return;
      }
      setSuccess(true);
    } catch {
      setErrMsg("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className={surface === "mobile" ? "px-4 pb-12" : "max-w-3xl mx-auto px-4 sm:px-6 pb-12"}>
        <div className="rounded-card border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-[18px] font-bold text-emerald-900">
            Thanks &mdash; we&rsquo;re on it.
          </h2>
          <p className="mt-2 text-[14px] text-emerald-800">
            We&rsquo;ll match you with a vetted live-in carer within 48 hours
            and email you to confirm. No payment is taken until a carer is
            placed.
          </p>
          <p className="mt-3 text-[13px] text-emerald-800/80">
            If you need to add anything, just reply to the confirmation email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={surface === "mobile" ? "px-4 pb-32" : "max-w-3xl mx-auto px-4 sm:px-6 pb-32"}
    >
      <div className="space-y-5">
        <div>
          <FieldLabel surface={surface}>What kind of care?</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {SERVICES.map((s) => {
              const on = service === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setService(s.value)}
                  className={`text-left p-3 rounded-card border transition ${
                    on
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="text-sm font-semibold">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel surface={surface}>Start date</FieldLabel>
          <input
            type="date"
            required
            value={startDate}
            min={minDateISO}
            onChange={(e) => setStartDate(e.target.value)}
            className={inputClass(surface)}
          />
          <p className="mt-1 text-[12px] text-slate-500">
            Earliest start is 7 days from today so we can complete DBS / Checkr
            placement.
          </p>
        </div>

        <div>
          <FieldLabel surface={surface}>How long?</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {WEEK_PRESETS.map((w) => {
              const on = weeks === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeeks(w)}
                  className={`px-4 py-2 rounded-pill border text-sm font-semibold transition ${
                    on
                      ? "bg-slate-900 border-slate-900 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {w} week{w === 1 ? "" : "s"}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel surface={surface}>Address</FieldLabel>
          <input
            type="text"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, town, postcode"
            autoComplete="street-address"
            className={inputClass(surface)}
          />
        </div>

        <div>
          <FieldLabel surface={surface}>
            Tell us about the person being cared for
          </FieldLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Mobility, conditions, daily routine, anything we should know…"
            rows={5}
            className={textareaClass(surface)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel surface={surface}>Email</FieldLabel>
            <input
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={inputClass(surface)}
            />
          </div>
          <div>
            <FieldLabel surface={surface}>Phone (optional)</FieldLabel>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+44 7…"
              autoComplete="tel"
              className={inputClass(surface)}
            />
          </div>
        </div>

        {errMsg && (
          <p className="rounded-card bg-rose-50 border border-rose-200 text-rose-700 text-[13px] px-3 py-2">
            {errMsg}
          </p>
        )}
      </div>

      <StickyFareBar
        surface={surface}
        weeks={weeks}
        rateCents={rate.rate_cents}
        totalCents={totalCents}
        currency={rate.currency}
        symbol={rate.symbol}
        submitting={submitting}
      />
    </form>
  );
}

function StickyFareBar({
  surface,
  weeks,
  rateCents,
  totalCents,
  symbol,
  submitting,
}: {
  surface: Surface;
  weeks: number;
  rateCents: number;
  totalCents: number;
  currency: "GBP" | "USD";
  symbol: "£" | "$";
  submitting: boolean;
}) {
  const positionClass =
    surface === "mobile"
      ? "fixed inset-x-0 bottom-0 z-40 bg-white border-t border-line shadow-nav"
      : "fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-slate-100 shadow-nav";
  return (
    <div
      className={positionClass}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
    >
      <div
        className={
          surface === "mobile"
            ? "px-4 pt-3"
            : "max-w-3xl mx-auto px-4 sm:px-6 pt-3"
        }
      >
        <div className="text-[12px] text-slate-600 leading-tight mb-3">
          <div className="font-semibold text-slate-800">
            {weeks} week{weeks === 1 ? "" : "s"} × 7 days × {symbol}
            {(rateCents / 100).toFixed(0)} = {symbol}
            {(totalCents / 100).toFixed(0)}
          </div>
          <div>We&rsquo;ll match you with a carer within 48 hours.</div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full h-14 rounded-btn bg-slate-900 text-white text-[15px] font-semibold hover:bg-slate-800 transition disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Request live-in carer"}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({
  surface,
  children,
}: {
  surface: Surface;
  children: ReactNode;
}) {
  return (
    <label
      className={`block mb-2 ${
        surface === "mobile"
          ? "text-[14px] font-semibold text-heading"
          : "text-sm font-semibold text-slate-800"
      }`}
    >
      {children}
    </label>
  );
}

function inputClass(surface: Surface) {
  if (surface === "mobile") {
    return "w-full h-14 rounded-btn border border-line bg-white px-4 text-[15px] text-heading placeholder:text-[#A3A3A3] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  }
  return "w-full h-12 rounded-btn border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
}

function textareaClass(surface: Surface) {
  if (surface === "mobile") {
    return "w-full rounded-btn border border-line bg-white px-4 py-3 text-[15px] text-heading placeholder:text-[#A3A3A3] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  }
  return "w-full rounded-btn border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
}

function prettyError(code: string | undefined): string {
  switch (code) {
    case "invalid_email":
      return "Please enter a valid email.";
    case "invalid_address":
      return "Please enter a full address.";
    case "invalid_weeks":
      return "Please choose a duration between 1 and 52 weeks.";
    case "invalid_start_date":
      return "Please choose a valid start date.";
    case "invalid_service":
      return "Please choose what kind of care you need.";
    default:
      return "Something went wrong. Please try again.";
  }
}

"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  IconCal,
  IconStar,
  Input,
  TextArea,
  TopBar,
} from "../../_components/ui";
import { CARE_FORMAT_BLURB, type CareFormat } from "../../_lib/mock";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import { careFormatLabel } from "@/lib/care/formats";
import { createClient } from "@/lib/supabase/client";
import type {
  ApiCarerResponse,
  ApiCarerProfile,
} from "@/app/api/m/carer/[id]/route";

/**
 * Create Booking — Figma 46:2379, extended for live-in.
 *
 * Layout untouched; data source is now /api/m/carer/[id] (real profile).
 * Submit calls a real backend:
 *   visiting → POST /api/stripe/create-booking-intent → checkout
 *   live-in  → POST /api/bookings/live-in/request → checkout
 *
 * The page now opens with a "Type of care" segmented control. The rest
 * of the form is conditional on that choice:
 *
 *   • Visiting → calendar single-date + slot + From/To hours (hourly bill).
 *   • Live-in  → calendar start-date + end-date (weekly bill).
 */

const SLOT_OPTIONS = [
  { label: "10:00 AM - 12:00 PM", from: "10:00", to: "12:00" },
  { label: "2:00 PM - 6:00 PM", from: "14:00", to: "18:00" },
  { label: "9:00 AM - 12:00 PM", from: "09:00", to: "12:00" },
];

function fmtDateShort(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function narrowCurrency(c: string | null | undefined): "GBP" | "USD" {
  return (c ?? "GBP").toUpperCase() === "USD" ? "USD" : "GBP";
}

function carerName(profile: ApiCarerProfile): string {
  return profile.display_name ?? profile.full_name ?? "Caregiver";
}

function carerLocation(profile: ApiCarerProfile): string {
  const country =
    profile.country?.toUpperCase() === "GB"
      ? "UK"
      : profile.country?.toUpperCase() === "US"
        ? "US"
        : profile.country ?? null;
  return [profile.city, country]
    .filter((s): s is string => Boolean(s))
    .join(", ");
}

/** "08:00" → "08:00:00" → ISO at the given local-day boundary. */
function combineLocalDateTime(date: Date, hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const d = new Date(date);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

function isoDateOnly(d: Date): string {
  // YYYY-MM-DD, in local time so the date the user picked is what we send.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CreateBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  // ── Real carer fetch (replaces getCarer() mock) ──────────────────
  const [profile, setProfile] = useState<ApiCarerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/m/carer/${params.id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoaded(true);
          return;
        }
        if (!res.ok) {
          setLoaded(true);
          return;
        }
        const json = (await res.json()) as ApiCarerResponse;
        if (!cancelled) {
          setProfile(json.profile);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  // Default to whichever format the carer offers first; falls back to
  // visiting. Recomputed when the profile arrives.
  const offered: CareFormat[] = useMemo(() => {
    const fmts = (profile?.care_formats ?? []).filter(
      (f): f is CareFormat => f === "visiting" || f === "live_in",
    );
    return fmts.length > 0 ? fmts : ["visiting"];
  }, [profile]);

  const [careType, setCareType] = useState<CareFormat>("visiting");
  useEffect(() => {
    setCareType(offered[0] ?? "visiting");
  }, [offered]);

  const [service, setService] = useState<string>("");
  useEffect(() => {
    if (profile && profile.services.length > 0 && !service) {
      setService(profile.services[0]);
    }
  }, [profile, service]);

  // Visiting state
  const [monthOffset, setMonthOffset] = useState(0);
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Live-in state — uses its own month nav so the user can scroll independently
  const [liMonthOffset, setLiMonthOffset] = useState(0);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const month = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const liMonth = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + liMonthOffset, 1);
  }, [liMonthOffset]);

  // Number of weeks (rounded up) for the live-in summary preview.
  // Hoisted above the early-return branches so hook order stays stable.
  const weeks = useMemo(() => {
    if (careType !== "live_in" || !startDate || !endDate) return 0;
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(1, Math.ceil(days / 7));
  }, [careType, startDate, endDate]);

  // Loading skeleton.
  if (!loaded) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen pb-32">
        <TopBar back={`/m/carer/${params?.id ?? ""}`} title="Create Booking" />
        <div className="bg-white px-6 pt-2 pb-6 flex flex-col items-center text-center border-b border-line">
          <div className="h-[88px] w-[88px] rounded-full bg-muted animate-pulse" />
          <div className="mt-3 h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="mt-2 h-3 w-24 rounded bg-muted animate-pulse" />
        </div>
        <div className="px-4 pt-4 space-y-4">
          <div className="h-10 rounded-btn bg-muted animate-pulse" />
          <div className="h-32 rounded-card bg-muted animate-pulse" />
        </div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar
          back={`/m/carer/${params?.id ?? ""}`}
          title="Create Booking"
        />
        <p className="px-6 mt-10 text-center text-heading">Carer not found.</p>
      </main>
    );
  }

  const name = carerName(profile);
  const location = carerLocation(profile);
  const currency = narrowCurrency(profile.currency);
  const hourlyRateCents = profile.hourly_rate_cents;
  const weeklyRateCents = profile.weekly_rate_cents;
  const ratePerHourLabel =
    hourlyRateCents != null
      ? `${formatMoney(hourlyRateCents, currency)} / hr`
      : null;
  // Rate gate: visiting bookings need an hourly rate; live-in bookings
  // don't need a Stripe price (the request just emails admin) so we
  // only block visiting submission when the rate is unset.
  const visitingRateMissing =
    careType === "visiting" && hourlyRateCents == null;

  // Validity differs per branch.
  const visitingValid = !!(date && slot && from && to && address);
  const liveInValid = !!(
    startDate &&
    endDate &&
    endDate.getTime() > startDate.getTime() &&
    address
  );
  const canContinue =
    !submitting &&
    !visitingRateMissing &&
    (careType === "visiting" ? visitingValid : liveInValid);

  async function onContinue() {
    if (!canContinue || !profile) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (careType === "visiting") {
        if (!date || !from || !to || hourlyRateCents == null) {
          setSubmitError("Pick a date, time, and check the rate.");
          return;
        }
        const startsAt = combineLocalDateTime(date, from);
        const endsAt = combineLocalDateTime(date, to);
        if (!startsAt || !endsAt) {
          setSubmitError("Invalid time.");
          return;
        }
        const hours =
          (Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000;
        if (!Number.isFinite(hours) || hours <= 0) {
          setSubmitError("End time must be after start time.");
          return;
        }
        const res = await fetch("/api/stripe/create-booking-intent", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caregiver_id: profile.user_id,
            starts_at: startsAt,
            ends_at: endsAt,
            hours,
            hourly_rate_cents: hourlyRateCents,
            currency: currency.toLowerCase(),
            service_type: service,
            notes: notes || undefined,
            location_country: profile.country ?? undefined,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          booking_id?: string;
          client_secret?: string;
          total_cents?: number;
          error?: string;
        };
        if (!res.ok || !json.booking_id) {
          setSubmitError(json.error ?? "Could not create booking.");
          return;
        }
        const qp = new URLSearchParams();
        qp.set("booking", json.booking_id);
        if (json.client_secret) qp.set("cs", json.client_secret);
        if (typeof json.total_cents === "number") {
          qp.set("total", String(json.total_cents));
        }
        qp.set("currency", currency.toLowerCase());
        qp.set("careType", "visiting");
        router.push(`/m/book/${profile.user_id}/checkout?${qp.toString()}`);
      } else {
        // live-in branch — calls the existing admin-emailed request endpoint.
        if (!startDate || !endDate || weeks < 1) {
          setSubmitError("Pick start and end dates.");
          return;
        }
        // contact_email is required by the API — pull from auth user.
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const contactEmail = user?.email ?? "";
        if (!contactEmail) {
          setSubmitError(
            "Sign in with the email you'd like us to contact you on.",
          );
          return;
        }
        const country: "GB" | "US" =
          profile.country?.toUpperCase() === "US" ? "US" : "GB";
        const res = await fetch("/api/bookings/live-in/request", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service,
            start_date: isoDateOnly(startDate),
            weeks,
            address,
            notes: notes || undefined,
            contact_email: contactEmail,
            country,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          request_id?: string;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.request_id) {
          setSubmitError(json.error ?? "Could not submit request.");
          return;
        }
        const qp = new URLSearchParams();
        qp.set("request", json.request_id);
        qp.set("liveIn", "1");
        qp.set("careType", "live_in");
        qp.set("currency", currency.toLowerCase());
        if (weeklyRateCents != null) {
          qp.set("weekly", String(weeklyRateCents));
          qp.set("weeks", String(weeks));
        }
        router.push(`/m/book/${profile.user_id}/checkout?${qp.toString()}`);
      }
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Could not submit booking.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back={`/m/carer/${profile.user_id}`} title="Create Booking" />

      {/* Carer header */}
      <div className="bg-white px-6 pt-2 pb-6 flex flex-col items-center text-center border-b border-line">
        <Avatar
          src={profile.photo_url ?? profile.avatar_url ?? undefined}
          name={name}
          size={88}
        />
        <p className="mt-3 text-[18px] font-bold text-heading">{name}</p>
        {location && (
          <p className="text-[12px] text-subheading">{location}</p>
        )}
        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-heading font-semibold">
          {profile.rating_count > 0 && profile.rating_avg != null && (
            <>
              <IconStar /> {profile.rating_avg.toFixed(1)}
              {profile.years_experience != null && profile.years_experience > 0 && (
                <span className="text-subheading"> · </span>
              )}
            </>
          )}
          {profile.years_experience != null && profile.years_experience > 0 && (
            <span>{profile.years_experience}+ years</span>
          )}
        </p>
        {ratePerHourLabel && (
          <p className="mt-1 text-[12px] text-subheading">
            From <span className="font-bold text-heading">{ratePerHourLabel}</span>
          </p>
        )}
      </div>

      <div className="px-4 pt-4 space-y-5">
        {/* Type of care — segmented control */}
        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Type of care</h2>
          <div
            role="tablist"
            aria-label="Type of care"
            className="grid grid-cols-2 gap-2 p-1 rounded-btn bg-muted"
          >
            {(["visiting", "live_in"] as const).map((t) => {
              const enabled = offered.includes(t);
              const active = careType === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active}
                  disabled={!enabled}
                  onClick={() => setCareType(t)}
                  className={`h-11 rounded-btn text-[13px] font-semibold transition ${
                    active
                      ? "bg-white text-primary shadow-sm"
                      : enabled
                      ? "text-heading"
                      : "text-subheading opacity-40"
                  }`}
                >
                  {careFormatLabel(t)}
                  {!enabled && (
                    <span className="block text-[10px] font-normal">
                      not offered
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-subheading leading-snug px-1">
            {CARE_FORMAT_BLURB[careType]}
          </p>
        </div>

        <h2 className="text-[14px] font-bold text-heading px-1">Professional</h2>
        <div className="rounded-btn border border-line bg-white px-4 h-12 flex items-center text-heading text-[14px]">
          {name}
        </div>

        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Select Categories</h2>
          {profile.services.length === 0 ? (
            <p className="text-[12.5px] text-subheading px-1">
              This carer hasn&rsquo;t listed any services yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s) => {
                const active = service === s;
                return (
                  <button
                    key={s}
                    onClick={() => setService(s)}
                    className={`h-12 px-4 rounded-btn border text-[14px] font-semibold transition flex items-center gap-2 ${
                      active
                        ? "border-primary text-primary bg-white"
                        : "border-line text-heading bg-white"
                    }`}
                  >
                    {serviceLabel(s)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {careType === "visiting" ? (
          <>
            {/* Visiting — single date + slot + hours */}
            <div>
              <h2 className="text-[14px] font-bold text-heading mb-2">Date</h2>
              <Calendar
                month={month}
                value={date}
                onChange={setDate}
                onPrev={() => setMonthOffset((m) => m - 1)}
                onNext={() => setMonthOffset((m) => m + 1)}
              />
            </div>

            <div>
              <h2 className="text-[14px] font-bold text-heading mb-2">Slots</h2>
              <div className="rounded-btn bg-white border border-line overflow-hidden">
                {SLOT_OPTIONS.map((s, i) => {
                  const active = slot === s.label;
                  return (
                    <button
                      key={s.label}
                      onClick={() => {
                        setSlot(s.label);
                        setFrom(s.from);
                        setTo(s.to);
                      }}
                      className={`w-full text-left px-4 h-12 text-[14px] flex items-center justify-between ${
                        i !== 0 ? "border-t border-line" : ""
                      } ${active ? "bg-primary-50 text-primary font-bold" : "text-heading"}`}
                    >
                      {s.label}
                      {active && <IconCal />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-[14px] font-bold text-heading mb-2">Booking Hours</h2>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="From"
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <Input
                  label="To"
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Live-in — start + end date pickers */}
            <div>
              <h2 className="text-[14px] font-bold text-heading mb-2">
                Placement dates
              </h2>
              <Calendar
                month={liMonth}
                value={null}
                rangeStart={startDate}
                rangeEnd={endDate}
                onChange={(d) => {
                  // First click sets start; second sets end; clicking again resets.
                  if (!startDate || (startDate && endDate)) {
                    setStartDate(d);
                    setEndDate(null);
                  } else if (d.getTime() <= startDate.getTime()) {
                    setStartDate(d);
                    setEndDate(null);
                  } else {
                    setEndDate(d);
                  }
                }}
                onPrev={() => setLiMonthOffset((m) => m - 1)}
                onNext={() => setLiMonthOffset((m) => m + 1)}
              />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-btn border border-line bg-white px-3 py-2">
                  <p className="text-[11px] text-subheading">Start</p>
                  <p className="text-[14px] font-semibold text-heading">
                    {startDate ? fmtDateShort(startDate) : "Select"}
                  </p>
                </div>
                <div className="rounded-btn border border-line bg-white px-3 py-2">
                  <p className="text-[11px] text-subheading">End</p>
                  <p className="text-[14px] font-semibold text-heading">
                    {endDate ? fmtDateShort(endDate) : "Select"}
                  </p>
                </div>
              </div>
              {weeks > 0 && (
                <p className="mt-2 text-[12px] text-subheading px-1">
                  {weeks} week{weeks === 1 ? "" : "s"} · billed weekly
                </p>
              )}
            </div>
          </>
        )}

        <Input
          label="Address"
          placeholder="Where should the carer come?"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <TextArea
          label="Notes for the carer (optional)"
          placeholder="Anything specific they should know — allergies, routine, access instructions…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        {visitingRateMissing && (
          <p className="text-[12.5px] text-subheading px-1">
            This carer hasn&rsquo;t set a rate yet — tap Message to ask before
            booking.
          </p>
        )}

        {submitError && (
          <p
            aria-live="polite"
            className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2"
          >
            {submitError}
          </p>
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom">
        <Button block disabled={!canContinue} onClick={onContinue}>
          {submitting ? "Sending…" : "Continue"}
        </Button>
      </div>
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Calendar — minimal, design-system styled.

   Two modes:
     • Single-date: pass `value`, omit range props.
     • Range: pass `rangeStart` / `rangeEnd`; the parent decides how
       clicks map to start vs end (see live-in branch above).
   ────────────────────────────────────────────────────────────────── */

function Calendar({
  month,
  value,
  rangeStart,
  rangeEnd,
  onChange,
  onPrev,
  onNext,
}: {
  month: Date;
  value: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onChange: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const monthName = month.toLocaleString("default", { month: "long" });
  const year = month.getFullYear();
  const firstWeekday = (month.getDay() + 6) % 7; // Mon-first index
  const daysInMonth = new Date(year, month.getMonth() + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const isInRange = (d: Date) => {
    if (!rangeStart || !rangeEnd) return false;
    const t = d.getTime();
    return t > rangeStart.getTime() && t < rangeEnd.getTime();
  };
  const isRangeEdge = (d: Date) => {
    const t = d.getTime();
    return (
      (rangeStart && t === rangeStart.getTime()) ||
      (rangeEnd && t === rangeEnd.getTime())
    );
  };

  return (
    <div className="rounded-card border border-line bg-white p-3">
      <div className="flex items-center justify-between px-2">
        <button onClick={onPrev} aria-label="Previous month" className="p-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-[16px] font-bold text-heading">{monthName}</p>
          <p className="text-[11px] text-subheading">{year}</p>
        </div>
        <button onClick={onNext} aria-label="Next month" className="p-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mt-2 px-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <span
            key={d}
            className={`text-center text-[11px] font-semibold py-2 ${
              i >= 5 ? "text-[#E55]" : "text-subheading"
            }`}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 px-1 pb-1">
        {cells.map((cell, i) => {
          if (cell === null) return <span key={i} />;
          const cellDate = new Date(year, month.getMonth(), cell);
          const isToday = new Date().toDateString() === cellDate.toDateString();
          const isSelected =
            value && value.toDateString() === cellDate.toDateString();
          const inRange = isInRange(cellDate);
          const edge = isRangeEdge(cellDate);
          const isWeekend = i % 7 >= 5;
          return (
            <button
              key={i}
              onClick={() => onChange(cellDate)}
              className={`aspect-square grid place-items-center text-[14px] rounded-full transition ${
                isSelected || edge
                  ? "bg-primary text-white font-bold"
                  : inRange
                  ? "bg-primary-50 text-primary"
                  : isWeekend
                  ? "text-[#E55]"
                  : "text-heading"
              } ${isToday && !isSelected && !edge ? "ring-1 ring-primary" : ""}`}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}

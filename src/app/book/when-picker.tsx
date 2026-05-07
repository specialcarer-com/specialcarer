"use client";

/**
 * Unified "When" picker — Uber-style segmented control with three tabs:
 * Now / Schedule / Recurring.
 *
 * This component is the entry point for the new /book and /m/book pages.
 * It orchestrates the existing booking flows underneath:
 *   - "Now" → /book/instant (passing prefilled query params)
 *   - "Schedule" → /find-care (with prefilled service/postcode/date)
 *   - "Recurring" → coming-soon waitlist (POST /api/waitlist)
 *
 * The `surface` prop swaps between desktop ("web") and mobile ("mobile")
 * styling so the same picker can drive both /book and /m/book.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type Tab = "now" | "schedule" | "recurring";
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

const DURATION_OPTIONS = [1, 2, 4, 6, 8] as const;

type Match = {
  user_id: string;
  display_name: string | null;
  hourly_rate_cents: number | null;
  currency: string | null;
  distance_km: number;
  eta_minutes_estimate: number;
};

type LiveQuote = {
  loading: boolean;
  count: number;
  minEtaMinutes: number | null;
  minRateCents: number | null;
  currency: "GBP" | "USD";
  error: string | null;
};

const DEFAULT_QUOTE: LiveQuote = {
  loading: false,
  count: 0,
  minEtaMinutes: null,
  minRateCents: null,
  currency: "GBP",
  error: null,
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Detects whether to display GBP or USD rates from the matches returned
 * by /api/instant-match. Falls back to GBP when the carer hasn't set a
 * currency yet.
 */
function pickCurrency(matches: Match[]): "GBP" | "USD" {
  for (const m of matches) {
    if (m.currency === "USD") return "USD";
    if (m.currency === "GBP") return "GBP";
  }
  return "GBP";
}

function fmtRate(cents: number, currency: "GBP" | "USD") {
  const sym = currency === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(0)}`;
}

function fmtTotal(hours: number, cents: number, currency: "GBP" | "USD") {
  const sym = currency === "USD" ? "$" : "£";
  return `${sym}${((hours * cents) / 100).toFixed(0)}`;
}

export default function WhenPicker({
  surface,
  initialTab = "now",
}: {
  surface: Surface;
  initialTab?: Tab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);

  // Shared inputs across Now + Schedule
  const [postcode, setPostcode] = useState("");
  const [service, setService] = useState<ServiceType>("elderly_care");
  const [durationHours, setDurationHours] = useState<number>(2);

  // Schedule-only inputs
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const [scheduleDate, setScheduleDate] = useState(localDateStr(tomorrow));
  const [scheduleStart, setScheduleStart] = useState("09:00");
  const [scheduleEnd, setScheduleEnd] = useState("11:00");

  // Live quote pill state
  const [quote, setQuote] = useState<LiveQuote>(DEFAULT_QUOTE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<AbortController | null>(null);

  const scheduleDurationHours = useMemo(() => {
    const [sh, sm] = scheduleStart.split(":").map(Number);
    const [eh, em] = scheduleEnd.split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
    const minutes = eh * 60 + em - (sh * 60 + sm);
    return Math.max(0, minutes / 60);
  }, [scheduleStart, scheduleEnd]);

  // Currently relevant duration for the fare ribbon
  const activeHours =
    tab === "schedule" ? scheduleDurationHours : durationHours;

  /**
   * Fetch a live preview from /api/instant-match so the user sees
   * "✦ 3 carers · ~7 min · from £18/hr" while typing. Debounced 400ms.
   * For the "schedule" tab we still call the same endpoint but ignore
   * the ETA — used only as a "X carers in your area" count.
   */
  const fetchQuote = useCallback(async () => {
    if (tab === "recurring") return;
    if (postcode.trim().length < 3) {
      setQuote(DEFAULT_QUOTE);
      return;
    }

    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;

    setQuote((q) => ({ ...q, loading: true, error: null }));
    const requestStartedAt = Date.now();

    try {
      const start =
        tab === "schedule"
          ? new Date(`${scheduleDate}T${scheduleStart}`)
          : new Date(Date.now() + 60 * 60_000);
      const end =
        tab === "schedule"
          ? new Date(`${scheduleDate}T${scheduleEnd}`)
          : new Date(start.getTime() + durationHours * 60 * 60_000);

      const res = await fetch("/api/instant-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: postcode.trim(),
          service_type: service,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          max_results: 5,
        }),
        signal: ac.signal,
      });
      const json = (await res.json()) as {
        matches?: Match[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "no_match");
      }
      const matches = json.matches ?? [];
      const currency = pickCurrency(matches);
      const rates = matches
        .map((m) => m.hourly_rate_cents)
        .filter((c): c is number => typeof c === "number" && c > 0);
      const etas = matches
        .map((m) => m.eta_minutes_estimate)
        .filter((n) => typeof n === "number");

      // Min display time so the shimmer doesn't flash.
      const elapsed = Date.now() - requestStartedAt;
      if (elapsed < 300) {
        await new Promise((r) => setTimeout(r, 300 - elapsed));
      }

      if (ac.signal.aborted) return;
      setQuote({
        loading: false,
        count: matches.length,
        minEtaMinutes: etas.length ? Math.min(...etas) : null,
        minRateCents: rates.length ? Math.min(...rates) : null,
        currency,
        error: null,
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "error";
      setQuote({
        loading: false,
        count: 0,
        minEtaMinutes: null,
        minRateCents: null,
        currency: "GBP",
        error: msg,
      });
    }
  }, [
    tab,
    postcode,
    service,
    durationHours,
    scheduleDate,
    scheduleStart,
    scheduleEnd,
  ]);

  // Debounce 400ms after each input change.
  useEffect(() => {
    if (tab === "recurring") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchQuote();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [tab, fetchQuote]);

  function handleNowSubmit() {
    if (!postcode.trim()) return;
    const params = new URLSearchParams({
      postcode: postcode.trim(),
      service,
      duration: String(durationHours),
      start: "60",
    });
    const target =
      surface === "mobile"
        ? `/m/book/instant?${params.toString()}`
        : `/book/instant?${params.toString()}`;
    router.push(target);
  }

  function handleScheduleSubmit() {
    if (!postcode.trim()) return;
    // Send the user to the existing find-care list with prefilled filters.
    // The /book/[caregiverId] flow takes over once they pick a specific carer.
    const params = new URLSearchParams({
      postcode: postcode.trim(),
      service,
      date: scheduleDate,
      start: scheduleStart,
      end: scheduleEnd,
    });
    router.push(`/find-care?${params.toString()}`);
  }

  // ──────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────

  const isMobile = surface === "mobile";
  const wrapperClass = isMobile
    ? "px-4 pb-32"
    : "max-w-3xl mx-auto px-4 sm:px-6 pb-32";

  return (
    <div className={wrapperClass}>
      <SegmentedControl tab={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "now" && (
          <NowPanel
            surface={surface}
            postcode={postcode}
            setPostcode={setPostcode}
            service={service}
            setService={setService}
            durationHours={durationHours}
            setDurationHours={setDurationHours}
          />
        )}
        {tab === "schedule" && (
          <SchedulePanel
            surface={surface}
            postcode={postcode}
            setPostcode={setPostcode}
            service={service}
            setService={setService}
            date={scheduleDate}
            setDate={setScheduleDate}
            start={scheduleStart}
            setStart={setScheduleStart}
            end={scheduleEnd}
            setEnd={setScheduleEnd}
          />
        )}
        {tab === "recurring" && <RecurringPanel surface={surface} />}
      </div>

      {tab !== "recurring" && (
        <StickyActionBar
          surface={surface}
          tab={tab}
          quote={quote}
          hours={activeHours}
          disabled={!postcode.trim() || (tab === "schedule" && activeHours <= 0)}
          onClick={tab === "now" ? handleNowSubmit : handleScheduleSubmit}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Segmented control
// ────────────────────────────────────────────────────────────────────

function SegmentedControl({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  const items: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "now", label: "Now", icon: <BoltIcon /> },
    { key: "schedule", label: "Schedule", icon: <CalIcon /> },
    { key: "recurring", label: "Recurring", icon: <RepeatIcon /> },
  ];
  return (
    <div className="rounded-pill bg-slate-100 p-1 grid grid-cols-3 gap-1">
      {items.map((it) => {
        const active = tab === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={`h-11 rounded-pill flex items-center justify-center gap-1.5 text-[14px] font-semibold transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "bg-transparent text-slate-500"
            }`}
          >
            <span aria-hidden>{it.icon}</span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Now panel
// ────────────────────────────────────────────────────────────────────

function NowPanel({
  surface,
  postcode,
  setPostcode,
  service,
  setService,
  durationHours,
  setDurationHours,
}: {
  surface: Surface;
  postcode: string;
  setPostcode: (s: string) => void;
  service: ServiceType;
  setService: (s: ServiceType) => void;
  durationHours: number;
  setDurationHours: (n: number) => void;
}) {
  return (
    <div className="space-y-5">
      <PostcodeField
        surface={surface}
        value={postcode}
        onChange={setPostcode}
      />

      <div>
        <FieldLabel surface={surface}>For how long?</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((h) => {
            const on = durationHours === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => setDurationHours(h)}
                className={`px-4 py-2 rounded-pill border text-sm font-semibold transition ${
                  on
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                {h} hr
              </button>
            );
          })}
        </div>
      </div>

      <ServicePicker surface={surface} value={service} onChange={setService} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Schedule panel
// ────────────────────────────────────────────────────────────────────

function SchedulePanel({
  surface,
  postcode,
  setPostcode,
  service,
  setService,
  date,
  setDate,
  start,
  setStart,
  end,
  setEnd,
}: {
  surface: Surface;
  postcode: string;
  setPostcode: (s: string) => void;
  service: ServiceType;
  setService: (s: ServiceType) => void;
  date: string;
  setDate: (s: string) => void;
  start: string;
  setStart: (s: string) => void;
  end: string;
  setEnd: (s: string) => void;
}) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutes =
    [sh, sm, eh, em].some((n) => Number.isNaN(n))
      ? 0
      : Math.max(0, eh * 60 + em - (sh * 60 + sm));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const durationLabel =
    minutes === 0
      ? "End time must be after start"
      : `${hours > 0 ? `${hours} hr` : ""}${
          mins > 0 ? ` ${mins} min` : ""
        }`.trim();

  return (
    <div className="space-y-5">
      <PostcodeField
        surface={surface}
        value={postcode}
        onChange={setPostcode}
      />

      <div>
        <FieldLabel surface={surface}>When?</FieldLabel>
        <input
          type="date"
          value={date}
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass(surface)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel surface={surface}>Start</FieldLabel>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputClass(surface)}
          />
        </div>
        <div>
          <FieldLabel surface={surface}>End</FieldLabel>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={inputClass(surface)}
          />
        </div>
      </div>

      <p className="text-[13px] text-slate-500">Duration: {durationLabel}</p>

      <ServicePicker surface={surface} value={service} onChange={setService} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Recurring panel — waitlist capture
// ────────────────────────────────────────────────────────────────────

function RecurringPanel({ surface }: { surface: Surface }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    setErrMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, feature: "recurring_bookings" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setState("err");
        setErrMsg(
          json.error === "invalid_email"
            ? "Please enter a valid email."
            : "Something went wrong. Please try again."
        );
        return;
      }
      setState("ok");
    } catch {
      setState("err");
      setErrMsg("Network error. Please try again.");
    }
  }

  return (
    <div
      className={`rounded-card border border-slate-100 bg-white p-6 ${
        surface === "web" ? "shadow-card" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-brand-50 text-brand-700 text-[18px]">
          <RepeatIcon />
        </span>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold text-slate-900">
            Recurring care, coming this week
          </h2>
          <p className="mt-1 text-[14px] text-slate-600">
            Book the same carer for a weekly schedule — same time, same person,
            zero re-booking. We&rsquo;re finishing it now. Join the waitlist
            and we&rsquo;ll email you the moment it goes live.
          </p>
        </div>
      </div>

      {state === "ok" ? (
        <div className="mt-5 rounded-card bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          You&rsquo;re on the list. We&rsquo;ll be in touch shortly.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass(surface)}
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="w-full h-12 rounded-btn bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60"
          >
            {state === "loading" ? "Adding…" : "Notify me"}
          </button>
          {errMsg && (
            <p className="text-[13px] text-rose-600">{errMsg}</p>
          )}
        </form>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Sticky action bar — fare ribbon + ETA pill + CTA
// ────────────────────────────────────────────────────────────────────

function StickyActionBar({
  surface,
  tab,
  quote,
  hours,
  disabled,
  onClick,
}: {
  surface: Surface;
  tab: Tab;
  quote: LiveQuote;
  hours: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const ctaLabel = tab === "now" ? "Find carer" : "Find carers";
  const rateCents = quote.minRateCents;
  const fareLine =
    rateCents != null && hours > 0
      ? `${hours.toFixed(hours % 1 === 0 ? 0 : 1)} hr × ${fmtRate(
          rateCents,
          quote.currency
        )}/hr = ${fmtTotal(hours, rateCents, quote.currency)}`
      : "Enter your postcode to see live pricing";

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
        <div className="flex items-center justify-between gap-3">
          <EtaPill tab={tab} quote={quote} />
        </div>
        <div className="mt-2 mb-3 text-[12px] text-slate-600 leading-tight">
          <div className="font-semibold text-slate-800">{fareLine}</div>
          <div>Held securely. Released to carer 24h after shift.</div>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="w-full h-14 rounded-btn bg-slate-900 text-white text-[15px] font-semibold hover:bg-slate-800 transition disabled:opacity-50"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

function EtaPill({ tab, quote }: { tab: Tab; quote: LiveQuote }) {
  if (quote.loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-pill bg-slate-900 text-white px-3.5 py-1.5 text-[12px]">
        <span className="inline-block w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
        <span className="inline-block h-3 w-32 rounded bg-slate-700/70 animate-pulse" />
      </div>
    );
  }

  if (quote.error || quote.count === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-pill bg-slate-100 text-slate-600 px-3.5 py-1.5 text-[12px] font-medium">
        <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
        Enter a postcode to see availability
      </div>
    );
  }

  const dotColor = quote.count >= 3 ? "bg-emerald-400" : "bg-amber-400";
  const rate =
    quote.minRateCents != null
      ? `from ${fmtRate(quote.minRateCents, quote.currency)}/hr`
      : null;

  if (tab === "schedule") {
    return (
      <div className="inline-flex items-center gap-2 rounded-pill bg-slate-900 text-white px-3.5 py-1.5 text-[12px] font-medium">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor} sc-pulse`} />
        <span>
          ✦ {quote.count} carer{quote.count === 1 ? "" : "s"} in your area
        </span>
        {rate && <span className="opacity-80">· {rate}</span>}
      </div>
    );
  }

  const eta =
    quote.minEtaMinutes != null ? `~${quote.minEtaMinutes} min away` : null;
  return (
    <div className="inline-flex items-center gap-2 rounded-pill bg-slate-900 text-white px-3.5 py-1.5 text-[12px] font-medium">
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor} sc-pulse`} />
      <span>
        ✦ {quote.count} carer{quote.count === 1 ? "" : "s"} available
      </span>
      {eta && <span className="opacity-80">· {eta}</span>}
      {rate && <span className="opacity-80">· {rate}</span>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Shared sub-fields
// ────────────────────────────────────────────────────────────────────

function PostcodeField({
  surface,
  value,
  onChange,
}: {
  surface: Surface;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div>
      <FieldLabel surface={surface}>Where do you need care?</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. SW1A 1AA or 10001"
        autoComplete="postal-code"
        className={inputClass(surface)}
      />
    </div>
  );
}

function ServicePicker({
  surface,
  value,
  onChange,
}: {
  surface: Surface;
  value: ServiceType;
  onChange: (s: ServiceType) => void;
}) {
  return (
    <div>
      <FieldLabel surface={surface}>What kind of care?</FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        {SERVICES.map((s) => {
          const on = value === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange(s.value)}
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

// ────────────────────────────────────────────────────────────────────
// Inline icons (kept tiny — no extra dep)
// ────────────────────────────────────────────────────────────────────

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}
function CalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function RepeatIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

"use client";

/**
 * "What kind of care?" chooser — first step of the booking funnel.
 * Two cards: Visiting (hourly) and Live-in (daily). Tap routes to the
 * surface-specific sub-flow.
 */

import Link from "next/link";
import {
  LIVE_IN_DAILY_RATES,
  VISITING_HOURLY_RATES,
  type Country,
} from "@/lib/pricing";

type Surface = "web" | "mobile";

export default function CareFormatChooser({
  surface,
  country,
}: {
  surface: Surface;
  country: Country;
}) {
  const visiting = VISITING_HOURLY_RATES[country];
  const liveIn = LIVE_IN_DAILY_RATES[country];

  const visitingHref =
    surface === "mobile" ? "/m/book/visiting" : "/book/visiting";
  const liveInHref = surface === "mobile" ? "/m/book/live-in" : "/book/live-in";
  const browseHref =
    surface === "mobile" ? "/m/book/browse" : "/find-care";

  return (
    <div
      className={
        surface === "mobile"
          ? "px-4 pb-12"
          : "max-w-4xl mx-auto px-4 sm:px-6 pb-16"
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ChoiceCard
          href={visitingHref}
          icon={<ClockIcon />}
          title="Visiting care"
          subtitle={`By the hour · from ${visiting.symbol}${(visiting.rate_cents / 100).toFixed(0)}/hr`}
          body="A carer comes to your home for hourly shifts. Available now or scheduled."
        />
        <ChoiceCard
          href={liveInHref}
          icon={<HomeIcon />}
          title="Live-in care"
          subtitle={`Daily rate · from ${liveIn.symbol}${(liveIn.rate_cents / 100).toFixed(0)}/day`}
          body="A carer lives in your home for 7+ days. Provides round-the-clock support."
        />
      </div>

      <div className="mt-4">
        <ChoiceCard
          href={browseHref}
          icon={<SearchIcon />}
          title="Browse & choose your carer"
          subtitle="Pick from a ranked list"
          body="See nearby carers, compare profiles, then send a booking request to the one you choose."
          accent="subtle"
        />
      </div>

      <p
        className={`mt-6 text-center ${
          surface === "mobile"
            ? "text-[12px] text-subheading"
            : "text-xs text-slate-500"
        }`}
      >
        Background-checked carers · payments held in escrow ·{" "}
        {country === "US" ? "Available across the US" : "Available across the UK"}
      </p>
    </div>
  );
}

function ChoiceCard({
  href,
  icon,
  title,
  subtitle,
  body,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  body: string;
  accent?: "subtle";
}) {
  const subtle = accent === "subtle";
  return (
    <Link
      href={href}
      className={
        subtle
          ? "group block rounded-card border border-dashed border-slate-300 bg-slate-50 p-6 transition hover:border-slate-900 hover:bg-white hover:shadow-md"
          : "group block rounded-card border border-slate-200 bg-white p-6 shadow-card transition hover:border-slate-900 hover:shadow-md"
      }
    >
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-brand-50 text-brand-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[18px] font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-[13px] font-semibold text-slate-700">
            {subtitle}
          </p>
        </div>
      </div>
      <p className="mt-4 text-[14px] text-slate-600 leading-relaxed">{body}</p>
      <div className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 group-hover:gap-2 transition-all">
        Continue
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

function ClockIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

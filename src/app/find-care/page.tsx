import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import CaregiverCard from "@/components/caregiver-card";
import { searchCaregivers, listPublishedCities } from "@/lib/care/search";
import { SERVICES, isServiceKey } from "@/lib/care/services";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Find vetted caregivers — SpecialCarer",
  description:
    "Search background-checked, payouts-enabled caregivers across the UK and US. Filter by service, city, and budget.",
};

export const dynamic = "force-dynamic";

type SearchParams = {
  service?: string;
  city?: string;
  country?: string;
  min?: string;
  max?: string;
  q?: string;
  date?: string;
};

export default async function FindCarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const country =
    sp.country === "US" || sp.country === "GB" ? sp.country : undefined;
  const service = isServiceKey(sp.service) ? sp.service : undefined;
  const city = sp.city?.trim() || undefined;
  const minRate = sp.min ? Math.max(0, Number(sp.min)) * 100 : undefined;
  const maxRate = sp.max ? Math.max(0, Number(sp.max)) * 100 : undefined;
  const q = sp.q?.trim() || undefined;
  const requestedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  const requestedDateLabel = requestedDate
    ? new Date(requestedDate + "T00:00:00").toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : undefined;

  const [results, supabase, citiesAll] = await Promise.all([
    searchCaregivers({ service, city, country, minRate, maxRate, query: q }),
    createClient(),
    listPublishedCities(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bookable = !!user;

  // Sort by match_score descending
  const sorted = [...results].sort(
    (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0),
  );

  const cityOptions = Array.from(
    new Set(citiesAll.map((c) => c.city)),
  ).sort();

  return (
    <MarketingShell>
      <section className="px-6 py-10 sm:py-14 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
              Find care
            </span>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              Vetted caregivers near you.
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl">
              Every caregiver here is identity-verified, background-checked,
              and ready to take bookings.
            </p>
            {requestedDateLabel && (
              <p className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
                <span aria-hidden>→</span>
                Showing carers for {requestedDateLabel}. Confirm exact times when
                you message them.
              </p>
            )}
          </div>
          {!user && (
            <div className="text-sm text-slate-500">
              Browsing as a guest.{" "}
              <Link
                href="/login?redirectTo=/find-care"
                className="text-brand-700 hover:underline"
              >
                Sign in to book
              </Link>
              .
            </div>
          )}
        </div>

        {/* Filters */}
        <form
          method="get"
          className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-white p-4 rounded-2xl border border-slate-100"
        >
          <label className="text-sm sm:col-span-2 lg:col-span-2">
            <span className="text-slate-700 font-medium">Search</span>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Name, headline, keyword…"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Service</span>
            <select
              name="service"
              defaultValue={service ?? ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">Any service</option>
              {SERVICES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">City</span>
            <select
              name="city"
              defaultValue={city ?? ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">Any city</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-700 font-medium">Country</span>
            <select
              name="country"
              defaultValue={country ?? ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="">UK + US</option>
              <option value="GB">UK</option>
              <option value="US">US</option>
            </select>
          </label>
          <div className="text-sm grid grid-cols-2 gap-2">
            <label>
              <span className="text-slate-700 font-medium">Min /hr</span>
              <input
                type="number"
                name="min"
                inputMode="numeric"
                min={0}
                defaultValue={sp.min ?? ""}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </label>
            <label>
              <span className="text-slate-700 font-medium">Max /hr</span>
              <input
                type="number"
                name="max"
                inputMode="numeric"
                min={0}
                defaultValue={sp.max ?? ""}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200"
              />
            </label>
          </div>
          <div className="sm:col-span-2 lg:col-span-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between pt-1">
            <p className="text-xs text-slate-500">
              Rates are pre–service-fee. Final price shown at checkout.
            </p>
            <div className="flex gap-2">
              <Link
                href="/find-care"
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition"
              >
                Reset
              </Link>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
              >
                Apply filters
              </button>
            </div>
          </div>
        </form>

        {/* Results */}
        <div className="mt-8 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {sorted.length} caregiver{sorted.length === 1 ? "" : "s"} match your
            filters
          </h2>
          {service && (
            <Link
              href={SERVICES.find((s) => s.key === service)?.href ?? "/"}
              className="text-sm text-brand-700 hover:underline"
            >
              About this service →
            </Link>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="mt-6 p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-slate-700 font-medium">
              No caregivers match these filters yet.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Try widening your search — fewer filters, a nearby city, or a
              broader rate range. New caregivers are joining weekly.
            </p>
            <Link
              href="/find-care"
              className="mt-4 inline-block px-5 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
            >
              Reset filters
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((c) => (
              <li key={c.user_id}>
                <CaregiverCard c={c} bookable={bookable} />
              </li>
            ))}
          </ul>
        )}

        {/* Help footer */}
        <div className="mt-12 grid sm:grid-cols-3 gap-4 text-sm">
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <h3 className="font-semibold text-slate-900">How vetting works</h3>
            <p className="mt-1 text-slate-600">
              ID + selfie, full background check, payouts-enabled.{" "}
              <Link href="/trust" className="text-brand-700 hover:underline">
                See standards
              </Link>
              .
            </p>
          </div>
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <h3 className="font-semibold text-slate-900">What you&rsquo;ll pay</h3>
            <p className="mt-1 text-slate-600">
              Caregiver rate + 20% service fee, all-in.{" "}
              <Link href="/pricing" className="text-brand-700 hover:underline">
                Pricing detail
              </Link>
              .
            </p>
          </div>
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <h3 className="font-semibold text-slate-900">Need help choosing?</h3>
            <p className="mt-1 text-slate-600">
              Email{" "}
              <a
                href="mailto:support@specialcarer.com"
                className="text-brand-700 hover:underline"
              >
                support@specialcarer.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

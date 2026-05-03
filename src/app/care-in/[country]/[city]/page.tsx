import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import CaregiverCard from "@/components/caregiver-card";
import { CITIES, getCity } from "@/lib/care/cities";
import { searchCaregivers } from "@/lib/care/search";
import { SERVICES, serviceLabel } from "@/lib/care/services";
import { createClient } from "@/lib/supabase/server";

export async function generateStaticParams() {
  return CITIES.map((c) => ({ country: c.countrySlug, city: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string; city: string }>;
}): Promise<Metadata> {
  const { country, city } = await params;
  const entry = getCity(country, city);
  if (!entry) return { title: "Care not found — SpecialCarer" };
  return {
    title: `Caregivers in ${entry.city}, ${entry.region} — SpecialCarer`,
    description: `Vetted, background-checked childcare, eldercare, and special-needs caregivers in ${entry.city}. Book online with SpecialCarer.`,
    alternates: {
      canonical: `https://specialcarer.com/care-in/${entry.countrySlug}/${entry.slug}`,
    },
  };
}

export const dynamic = "force-dynamic";

export default async function CityPage({
  params,
}: {
  params: Promise<{ country: string; city: string }>;
}) {
  const { country, city } = await params;
  const entry = getCity(country, city);
  if (!entry) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bookable = !!user;

  const caregivers = await searchCaregivers({
    country: entry.country,
    city: entry.city,
    limit: 12,
  });

  const otherCities = CITIES.filter(
    (c) => c.country === entry.country && c.slug !== entry.slug,
  );

  return (
    <MarketingShell>
      <section className="px-6 py-14 sm:py-20 max-w-5xl mx-auto">
        <nav className="text-xs text-slate-500 mb-4" aria-label="Breadcrumb">
          <Link href="/" className="hover:underline">
            Home
          </Link>
          {" › "}
          <Link href="/find-care" className="hover:underline">
            Find care
          </Link>
          {" › "}
          <span className="text-slate-700">{entry.city}</span>
        </nav>
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          {entry.country === "GB" ? "United Kingdom" : "United States"}
        </span>
        <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Caregivers in {entry.city}.
        </h1>
        <p className="mt-5 text-lg text-slate-600 leading-relaxed max-w-3xl">
          {entry.blurb}
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <Link
            href={`/find-care?city=${encodeURIComponent(entry.city)}&country=${entry.country}`}
            className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition text-center"
          >
            Search all {entry.city} caregivers
          </Link>
          <Link
            href="/how-it-works"
            className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition text-center"
          >
            How it works
          </Link>
        </div>
      </section>

      <section className="px-6 py-10 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Browse caregivers near you
          </h2>
          {caregivers.length === 0 ? (
            <div className="mt-6 p-6 rounded-2xl bg-white border border-slate-100 text-slate-600">
              We&rsquo;re still onboarding caregivers in {entry.city}. Be the
              first to{" "}
              <Link
                href="/become-a-caregiver"
                className="text-brand-700 hover:underline"
              >
                apply as a caregiver
              </Link>{" "}
              — or check{" "}
              <Link
                href="/find-care"
                className="text-brand-700 hover:underline"
              >
                nearby cities
              </Link>
              .
            </div>
          ) : (
            <ul className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {caregivers.map((c) => (
                <li key={c.user_id}>
                  <CaregiverCard c={c} bookable={bookable} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Care services in {entry.city}
          </h2>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SERVICES.map((s) => (
              <Link
                key={s.key}
                href={`/find-care?service=${s.key}&city=${encodeURIComponent(entry.city)}&country=${entry.country}`}
                className="bg-white p-5 rounded-xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition"
              >
                <h3 className="font-semibold text-slate-900">
                  {serviceLabel(s.key)}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {entry.city} caregivers
                </p>
                <span className="mt-3 inline-block text-sm text-brand-700">
                  Browse →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Areas we cover in {entry.city}
          </h2>
          <p className="mt-2 text-slate-600">
            Our caregivers travel throughout {entry.city}. These are some of the
            neighbourhoods where bookings happen most often.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {entry.neighbourhoods.map((n) => (
              <span
                key={n}
                className="px-3 py-1 rounded-full bg-white border border-slate-200 text-sm text-slate-700"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Trust &amp; safety in {entry.city}
          </h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            Every caregiver completes ID verification, an{" "}
            {entry.country === "GB"
              ? "Enhanced DBS check via uCheck (with the relevant Barred List)"
              : "Checkr screening covering national criminal records, county records, and the Sex Offender Registry"}
            , and is monitored throughout each shift via live location. See our
            full{" "}
            <Link href="/trust" className="text-brand-700 hover:underline">
              Trust &amp; Safety standards
            </Link>{" "}
            for the detail.
          </p>
        </div>
      </section>

      {otherCities.length > 0 && (
        <section className="px-6 py-12 bg-slate-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-semibold text-slate-900">
              Other {entry.country === "GB" ? "UK" : "US"} cities
            </h2>
            <ul className="mt-5 flex flex-wrap gap-3">
              {otherCities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/care-in/${c.countrySlug}/${c.slug}`}
                    className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-100 transition"
                  >
                    {c.city}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto bg-brand text-white rounded-2xl px-8 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Ready to book a caregiver in {entry.city}?
          </h2>
          <Link
            href={`/find-care?city=${encodeURIComponent(entry.city)}&country=${entry.country}`}
            className="mt-6 inline-block px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-brand-50 transition"
          >
            Browse {entry.city} caregivers
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

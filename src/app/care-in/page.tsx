import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";
import { CITIES } from "@/lib/care/cities";

export const metadata: Metadata = {
  title: "Care by city — SpecialCarer",
  description:
    "SpecialCarer covers cities across the UK and US. Find vetted caregivers near you.",
};

export default function Page() {
  const uk = CITIES.filter((c) => c.country === "GB");
  const us = CITIES.filter((c) => c.country === "US");

  return (
    <MarketingShell>
      <PageHeroBanner pageKey="marketing.cities" height="md" tint="soft" />
      <section className="px-6 py-16 sm:py-20 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          Cities
        </span>
        <h1 className="mt-3 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Care, city by city.
        </h1>
        <p className="mt-4 text-lg text-slate-600 max-w-2xl">
          We&rsquo;re live in cities across the UK and US, with new ones added
          monthly. Browse caregivers near you.
        </p>
      </section>

      <section className="px-6 py-10 bg-slate-50">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              United Kingdom
            </h2>
            <ul className="mt-5 space-y-3">
              {uk.map((c) => (
                <li
                  key={c.slug}
                  className="bg-white p-5 rounded-xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition"
                >
                  <Link
                    href={`/care-in/${c.countrySlug}/${c.slug}`}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {c.city}
                      </div>
                      <div className="text-sm text-slate-600">{c.region}</div>
                    </div>
                    <span className="text-sm text-brand-700 font-medium">
                      Browse →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              United States
            </h2>
            <ul className="mt-5 space-y-3">
              {us.map((c) => (
                <li
                  key={c.slug}
                  className="bg-white p-5 rounded-xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition"
                >
                  <Link
                    href={`/care-in/${c.countrySlug}/${c.slug}`}
                    className="flex items-baseline justify-between gap-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {c.city}
                      </div>
                      <div className="text-sm text-slate-600">{c.region}</div>
                    </div>
                    <span className="text-sm text-brand-700 font-medium">
                      Browse →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-600">
            Don&rsquo;t see your city? It&rsquo;s probably on the list — we
            launch in new areas every month.
          </p>
          <Link
            href="/contact"
            className="mt-4 inline-block px-5 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 transition text-sm font-medium"
          >
            Tell us where to launch next
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

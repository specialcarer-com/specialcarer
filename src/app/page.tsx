import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import MarketingShell from "@/components/marketing-shell";
import CaregiverCard from "@/components/caregiver-card";
import HeroSearch from "@/components/hero-search";
import { ExplainerVideo } from "@/components/explainer-video";
import { HeroBanner } from "@/components/hero-banner";
import HomeBanner from "@/components/home-banner";
import { searchCaregivers, listPublishedCities } from "@/lib/care/search";
import { CITIES } from "@/lib/care/cities";
import { getAllPosts } from "@/lib/blog/posts";
import { listCoverageCities } from "@/lib/coverage-server";
import { US_REGION_ENABLED } from "@/lib/region";
import CoverageMap from "@/components/coverage-map-lazy";
import { HeroTeaserVideo } from "@/components/marketing/HeroTeaserVideo";
import { AnimatedSplashPhone } from "@/components/marketing/AnimatedSplashPhone";
import { AnimatedBrowsePhone } from "@/components/marketing/AnimatedBrowsePhone";

export const metadata: Metadata = {
  title:
    "Special Carers — Vetted UK Carers, Babysitters & Nannies | specialcarers.com",
  description:
    "SpecialCarers connects families and care providers with vetted UK carers. DBS-checked RSWs, HCAs, babysitters and nannies in London and across the UK. Book vetted care in minutes.",
  alternates: { canonical: "https://www.specialcarers.com/" },
  openGraph: {
    title:
      "Special Carers — Vetted UK Carers, Babysitters & Nannies | specialcarers.com",
    description:
      "SpecialCarers connects families and care providers with vetted UK carers. DBS-checked RSWs, HCAs, babysitters and nannies in London and across the UK. Book vetted care in minutes.",
    url: "https://www.specialcarers.com/",
    siteName: "SpecialCarers",
    type: "website",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpecialCarers — trusted care, on your schedule",
      },
    ],
  },
};

// Reads Supabase auth/session state per request, so each render must be dynamic
export const dynamic = "force-dynamic";

export default async function Home() {
  const [featured, publishedCities, coverageCities] = await Promise.all([
    searchCaregivers({
      limit: 6,
      ...(US_REGION_ENABLED ? {} : { country: "GB" as const }),
    }).then((r) => r.slice(0, 6)),
    listPublishedCities(),
    listCoverageCities(),
  ]);
  const recentPosts = getAllPosts().slice(0, 3);
  const coverageLiveCount = coverageCities.filter(
    (c) => c.status === "live",
  ).length;

  // Only surface cities in the hero search that have at least one published caregiver
  const liveCityNames = new Set(
    publishedCities.map((c) => `${c.country}|${c.city.toLowerCase()}`),
  );
  const heroCities = CITIES.filter((c) =>
    liveCityNames.has(`${c.country}|${c.city.toLowerCase()}`),
  ).map((c) => ({
    city: c.city,
    country: c.country,
    slug: c.slug,
    countrySlug: c.countrySlug,
  }));

  // JSON-LD: Organization + WebSite + small FAQ
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "SpecialCarers",
        url: "https://www.specialcarers.com",
        logo: "https://www.specialcarers.com/icon.png",
        sameAs: [],
        parentOrganization: {
          "@type": "Organization",
          name: "All Care 4 U Group Limited",
          taxID: "09428739",
          address: {
            "@type": "PostalAddress",
            streetAddress: "85 Great Portland Street",
            addressLocality: "London",
            postalCode: "W1W 7LT",
            addressCountry: "GB",
          },
        },
      },
      {
        "@type": "WebSite",
        url: "https://www.specialcarers.com",
        name: "SpecialCarers",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://www.specialcarers.com/find-care?q={query}",
          "query-input": "required name=query",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: HOMEPAGE_FAQ.map((q) => ({
          "@type": "Question",
          name: q.q,
          acceptedAnswer: { "@type": "Answer", text: q.a },
        })),
      },
    ],
  };

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      <HomeBanner placement="home_top" />

      {/* Hero banner video */}
      <HeroBanner />

      {/* Hero */}
      <section className="px-6 pt-12 pb-20 sm:pt-16 sm:pb-28 max-w-5xl mx-auto text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-teal-700">
          For families &middot; For care providers &middot; For carers
        </p>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-slate-900">
          Trusted care, on your schedule.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
          SpecialCarers connects families and care providers with vetted,
          DBS-checked carers across the UK. On-demand and scheduled childcare,
          elder care, and special-needs support. Book in minutes. Track,
          message, and pay in one place.
        </p>

        <HeroSearch cities={heroCities} />

        <div className="mt-5 flex justify-center">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-pill bg-slate-900 text-white text-sm font-semibold shadow-sm hover:bg-slate-800 transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
            </svg>
            Book care · now, schedule or recurring
          </Link>
        </div>

        <div className="mt-3 flex flex-col sm:flex-row gap-1 sm:gap-2 items-center justify-center text-sm">
          <Link
            href="/book?when=now"
            className="inline-flex items-center min-h-[44px] px-3 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            Find a carer right now
          </Link>
          <span className="hidden sm:inline text-slate-300" aria-hidden>·</span>
          <Link
            href="/find-care"
            className="inline-flex items-center min-h-[44px] px-3 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            Browse all caregivers
          </Link>
          <span className="hidden sm:inline text-slate-300" aria-hidden>·</span>
          <Link
            href="/become-a-caregiver"
            className="inline-flex items-center min-h-[44px] px-3 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            Apply as a caregiver
          </Link>
          <span className="hidden sm:inline text-slate-300" aria-hidden>·</span>
          <Link
            href="/organisations"
            className="inline-flex items-center min-h-[44px] px-3 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            For care providers
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          DBS-checked carers via the UK Disclosure and Barring Service. Payments
          held in escrow until shifts complete.
        </p>
      </section>

      {/* Pricing transparency strip */}
      <section className="px-6">
        <div className="max-w-5xl mx-auto rounded-2xl bg-brand-50 border border-brand-100 px-6 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-700">
            <span className="font-semibold text-brand-700">
              Honest pricing.
            </span>
            <span>From £18/hr across the UK</span>
            <span className="text-slate-300">•</span>
            <span>No subscription</span>
            <span className="text-slate-300">•</span>
            <span>Pay only for shifts you book</span>
            <span className="text-slate-300">•</span>
            <span>24h escrow before payout</span>
            <Link
              href="/pricing"
              className="inline-flex items-center min-h-[44px] py-2 text-brand-700 font-medium hover:underline"
            >
              See pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* Explainer video */}
      <section className="px-6 pt-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              How SpecialCarers works
            </h2>
            <p className="mt-2 text-slate-600">
              From worried search to trusted carer at your door — in 45 seconds.
            </p>
          </div>
          <ExplainerVideo />
        </div>
      </section>

      {/* Quick stats / credibility strip */}
      <section className="px-6 pb-4 pt-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { k: "100%", v: "DBS-checked" },
            { k: "24h", v: "Average match time" },
            { k: "30%", v: "Flat platform fee" },
            { k: "UK-wide", v: "Day-one coverage" },
          ].map((s) => (
            <div
              key={s.v}
              className="rounded-2xl border border-slate-100 bg-white px-4 py-5"
            >
              <div className="text-2xl font-semibold text-slate-900">{s.k}</div>
              <div className="mt-1 text-xs text-slate-600">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Services grid */}
      <section id="services" className="px-6 py-16 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold">Care that fits your life</h2>
            <p className="mt-3 text-slate-600">
              Whether you need an hour of help or ongoing support, we match you
              with caregivers vetted for your situation.
            </p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {[
              {
                title: "Elderly care",
                copy: "Companionship, mobility, medication reminders, dementia-friendly support, respite for family carers.",
                href: "/services/elderly-care",
              },
              {
                title: "Childcare",
                copy: "Babysitters, after-school pickup, school holiday cover, overnight nannies, tutoring.",
                href: "/services/childcare",
              },
              {
                title: "Special-needs",
                copy: "Caregivers experienced with autism, ADHD, sensory processing, learning disabilities, and complex needs.",
                href: "/services/special-needs",
              },
              {
                title: "Postnatal",
                copy: "Maternity nurses, night nannies, breastfeeding peer support, and newborn-trained caregivers.",
                href: "/services/postnatal",
              },
              {
                title: "Complex care",
                copy: "Clinical-grade caregivers for PEG/tracheostomy, ventilator, seizure protocols, and palliative care.",
                href: "/services/complex-care",
              },
            ].map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="group bg-white p-6 rounded-2xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition"
              >
                <h3 className="font-semibold text-lg text-slate-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">
                  {s.copy}
                </p>
                <span className="mt-4 inline-block text-sm text-brand-700 font-medium group-hover:underline">
                  Learn more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Care formats — how care is delivered */}
      <section id="care-formats" className="px-6 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold">
              Live-in or visiting — your call
            </h2>
            <p className="mt-3 text-slate-600">
              Every type of care above can be delivered as a live-in placement
              or as scheduled visits. Many of our caregivers offer both.
            </p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 gap-6">
            {[
              {
                title: "Live-in care",
                copy: "A caregiver moves in for a placement of several days at a time — round-the-clock support without leaving home.",
                meta: "Paid as a weekly rate",
                href: "/care-formats/live-in",
              },
              {
                title: "Visiting care",
                copy: "Scheduled visits — from a single hour a week to several visits a day, on a recurring schedule or one-off.",
                meta: "Paid by the hour",
                href: "/care-formats/visiting",
              },
            ].map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="group bg-white p-6 rounded-2xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition"
              >
                <h3 className="font-semibold text-lg text-slate-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-slate-600 text-sm leading-relaxed">
                  {s.copy}
                </p>
                <span className="mt-3 inline-block text-xs text-slate-500 font-medium">
                  {s.meta}
                </span>
                <span className="mt-4 block text-sm text-brand-700 font-medium group-hover:underline">
                  Learn more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured caregivers — live data */}
      {featured.length > 0 && (
        <section className="px-6 py-16 bg-brand-50">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900">
                  Meet some of our caregivers
                </h2>
                <p className="mt-3 text-slate-600 max-w-2xl">
                  Every caregiver below is identity-verified, fully
                  background-checked, and ready to take bookings today.
                </p>
              </div>
              <Link
                href="/find-care"
                className="inline-flex items-center min-h-[44px] py-2 text-sm text-brand-700 font-medium hover:underline"
              >
                See all caregivers →
              </Link>
            </div>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.map((c) => (
                <CaregiverCard key={c.user_id} c={c} bookable={false} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section id="trust" className="px-6 py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold">
              Safety isn&rsquo;t a feature. It&rsquo;s the foundation.
            </h2>
            <p className="mt-3 text-slate-600">
              Every caregiver is identity-verified, background-checked, and
              monitored throughout each shift.
            </p>
          </div>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { k: "Enhanced DBS", v: "UK Disclosure and Barring Service checks" },
              { k: "Right to Work", v: "Confirmed before any carer goes live" },
              { k: "Annual refresh", v: "DBS status re-checked every year" },
              { k: "ID + selfie match", v: "Verified at signup, re-checked yearly" },
              { k: "Live shift tracking", v: "Real-time location for active bookings" },
            ].map((t) => (
              <div
                key={t.k}
                className="bg-white p-6 rounded-2xl border border-slate-100 text-center"
              >
                <div className="font-semibold text-slate-900">{t.k}</div>
                <div className="mt-1 text-sm text-slate-600">{t.v}</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/trust"
              className="inline-flex items-center min-h-[44px] py-2 text-sm text-brand-700 font-medium hover:underline"
            >
              Read the full Trust &amp; Safety standards →
            </Link>
          </div>
        </div>
      </section>

      {/* How it works teaser */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold text-slate-900">
              Booking care, simplified.
            </h2>
            <p className="mt-3 text-slate-600">
              From first search to shift complete in three steps.
            </p>
          </div>
          <div className="mt-12 grid lg:grid-cols-3 gap-8">
            {[
              {
                n: "1",
                t: "Tell us what you need",
                c: "Tell us the type of care, schedule, and any specific needs. Takes about a minute.",
              },
              {
                n: "2",
                t: "Match with vetted caregivers",
                c: "We surface caregivers who match your needs, schedule, and area — all background-checked.",
              },
              {
                n: "3",
                t: "Book, track, and pay",
                c: "Confirm your shift, follow live location during the booking, and pay only after it ends.",
              },
            ].map((s) => (
              <div key={s.n}>
                <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center font-semibold">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold text-lg text-slate-900">
                  {s.t}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {s.c}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/how-it-works"
              className="inline-flex items-center min-h-[44px] py-2 text-sm text-brand-700 font-medium hover:underline"
            >
              See the full process →
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials / social proof */}
      <section className="px-6 py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold text-slate-900">
              What families and providers say
            </h2>
            <p className="mt-3 text-slate-600">
              Stories from early users across the UK.
            </p>
          </div>
          <div className="mt-10 grid lg:grid-cols-3 gap-6">
            {[
              {
                q: "Booking was the easy part — what really mattered was that the caregiver had been properly vetted. The DBS check evidence in their profile gave me peace of mind.",
                n: "Helena R.",
                d: "Daughter caring for parent · London",
              },
              {
                q: "We needed school-holiday cover with about three days\u2019 notice. Got matched the same evening with a brilliant childminder who\u2019s now our go-to.",
                n: "Mark & Priya S.",
                d: "Working parents · Manchester",
              },
              {
                q: "I\u2019ve worked through agencies for ten years. SpecialCarers is the first platform where I keep most of what I earn — and I pick my own shifts.",
                n: "Aisha R.",
                d: "Caregiver · Birmingham",
              },
            ].map((t) => (
              <figure
                key={t.n}
                className="bg-white p-6 rounded-2xl border border-slate-100"
              >
                <blockquote className="text-slate-700 text-sm leading-relaxed">
                  &ldquo;{t.q}&rdquo;
                </blockquote>
                <figcaption className="mt-5 text-sm">
                  <div className="font-semibold text-slate-900">{t.n}</div>
                  <div className="text-slate-500">{t.d}</div>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            First names and details lightly edited for privacy. Stories
            collected with consent during early-access onboarding.
          </p>
        </div>
      </section>

      {/* Comparison: SpecialCarers vs Care.com vs traditional agency */}
      <section className="px-6 py-16 sm:py-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
              How we compare
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              Pick the option that respects your time and money.
            </h2>
            <p className="mt-3 text-slate-600">
              Honest side-by-side. No hidden subscriptions, no eye-watering
              agency markups.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold text-slate-700"
                  >
                    &nbsp;
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold text-brand-700 bg-brand-50/60"
                  >
                    SpecialCarers
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold text-slate-700"
                  >
                    Traditional agency
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold text-slate-700"
                  >
                    Care.com
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  {
                    label: "Subscription to message carers",
                    sc: { v: "None — free to browse and message", good: true },
                    ag: { v: "Usually free upfront, packaged into hourly markup" },
                    cc: {
                      v: "Premium required to message most carers (US$38.99/mo — Care.com does not operate in the UK)",
                      bad: true,
                    },
                  },
                  {
                    label: "Background checks",
                    sc: {
                      v: "Enhanced DBS via the UK Disclosure and Barring Service — we pay",
                      good: true,
                    },
                    ag: { v: "Included — cost baked into agency fee" },
                    cc: {
                      v: "CareCheck offered as paid add-on; basic check only",
                    },
                  },
                  {
                    label: "Platform fee on each booking",
                    sc: { v: "30% flat — transparent at checkout", good: true },
                    ag: {
                      v: "Often 50–100% markup over carer's take-home",
                      bad: true,
                    },
                    cc: { v: "You pay carers directly — no booking guardrails" },
                  },
                  {
                    label: "Payments & dispute window",
                    sc: {
                      v: "Held in escrow, released 24h after shift ends",
                      good: true,
                    },
                    ag: { v: "Invoiced after; agency mediates" },
                    cc: {
                      v: "Off-platform, peer-to-peer — no escrow",
                      bad: true,
                    },
                  },
                  {
                    label: "Live shift tracking & SOS",
                    sc: { v: "Built in for every shift", good: true },
                    ag: { v: "Rare — phone the office during hours" },
                    cc: { v: "Not provided" },
                  },
                  {
                    label: "Cancel anytime",
                    sc: { v: "Yes — no contract", good: true },
                    ag: { v: "Often locked into minimum hours per week" },
                    cc: {
                      v: "Annual plans auto-renew; FTC settled with Care.com over cancellation practices in 2024",
                      bad: true,
                    },
                  },
                ].map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="px-5 py-4 font-medium text-slate-900 align-top"
                    >
                      {row.label}
                    </th>
                    <td className="px-5 py-4 align-top bg-brand-50/30">
                      <span
                        className={
                          row.sc.good
                            ? "text-emerald-700"
                            : "text-slate-700"
                        }
                      >
                        {row.sc.good && <Tick />}
                        {row.sc.v}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-slate-600">
                      {row.ag.v}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span
                        className={
                          row.cc.bad
                            ? "text-rose-700"
                            : "text-slate-600"
                        }
                      >
                        {row.cc.v}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-500 max-w-3xl">
            Care.com pricing as published on their{" "}
            <a
              href="https://www.care.com/app/vhp/plans-and-pricing"
              target="_blank"
              rel="noopener nofollow"
              className="underline hover:text-slate-700"
            >
              Plans &amp; Pricing page
            </a>
            . FTC settlement reference:{" "}
            <a
              href="https://consumer.ftc.gov/consumer-alerts/2024/08/ftc-says-carecom-misled-workers"
              target="_blank"
              rel="noopener nofollow"
              className="underline hover:text-slate-700"
            >
              FTC Consumer Alert, August 2024
            </a>
            . Agency markup ranges based on UK CQC and home-care
            industry averages; your local agency may differ.
          </p>

          <div className="mt-8 text-center">
            <Link
              href="/find-care"
              className="inline-block px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
            >
              See vetted carers near you
            </Link>
          </div>
        </div>
      </section>

      {/* Recognition / press strip */}
      <section className="px-6 py-12 border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs uppercase tracking-wider text-slate-500">
            Backed by, partnered with &amp; built on
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {[
              { name: "Stripe", note: "Payments + escrow" },
              { name: "DBS", note: "UK background checks" },
              { name: "Mapbox", note: "Live shift tracking" },
            ].map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center w-[calc(50%-0.375rem)] sm:w-40"
              >
                <div className="font-semibold text-slate-700 text-sm">
                  {p.name}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{p.note}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
            Press enquiries:{" "}
            <Link href="/press" className="text-brand-700 hover:underline">
              press kit &amp; contact
            </Link>
          </p>
        </div>
      </section>

      {/* Employers (B2B) teaser */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto bg-slate-900 rounded-3xl px-8 py-12 sm:px-12 sm:py-16 text-white">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-medium">
                For employers &amp; HR teams
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                Backup care that retains parents &amp; carers in your workforce.
              </h2>
              <p className="mt-4 text-slate-300">
                Subsidise on-demand childcare, elder care, and special-needs
                support for your employees. Reduce absenteeism, improve
                retention, and meet your wellbeing commitments.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <ul className="space-y-3 text-sm text-slate-200">
                <li>• Per-employee or pooled-credit plans</li>
                <li>• Single UK-wide contract</li>
                <li>• SOC2-aligned data handling, full RLS</li>
                <li>• Usage dashboards &amp; quarterly reporting</li>
              </ul>
              <Link
                href="/employers"
                className="mt-6 inline-block px-6 py-3 rounded-xl bg-white text-slate-900 font-medium hover:bg-slate-100 transition"
              >
                See employer plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Organisations (B2B procurement) teaser */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto bg-brand-50 border border-brand-100 rounded-3xl px-8 py-12 sm:px-12 sm:py-16">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-white text-brand-700 text-xs font-medium border border-brand-100">
                For organisations
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold text-slate-900">
                Vetted carers for your service users — on demand and under contract.
              </h2>
              <p className="mt-4 text-slate-700">
                Councils, NHS trusts, fostering agencies, residential homes,
                schools, and charities. Master Services Agreement and Data
                Processing Addendum in place. Strict verification of every buyer.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <ul className="space-y-3 text-sm text-slate-700">
                <li>• Safer-recruited carers with Enhanced DBS / equivalent</li>
                <li>• Net-14 invoicing, PO support, framework pricing on request</li>
                <li>• GDPR-compliant DPA, audit trail on every booking</li>
                <li>• 12-hour shifts, sleep-ins, and recurring contracts</li>
              </ul>
              <Link
                href="/organisations"
                className="mt-6 inline-block px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
              >
                Explore for organisations
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Where we cover */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold text-slate-900">
              Where we cover
            </h2>
            <p className="mt-3 text-slate-600">
              Live in cities across the UK, with new ones every month.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {CITIES.slice(0, 6).map((c) => (
              <Link
                key={c.slug}
                href={`/care-in/${c.countrySlug}/${c.slug}`}
                className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-100 transition"
              >
                {c.city}
              </Link>
            ))}
            <Link
              href="/care-in"
              className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
            >
              All cities →
            </Link>
          </div>
        </div>
      </section>

      {/* Coverage map teaser */}
      {coverageCities.length > 0 && (
        <section className="px-6 py-16 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-3xl font-semibold text-slate-900">
                We are in {coverageLiveCount} cities and counting
              </h2>
              <p className="mt-3 text-slate-600">
                {coverageLiveCount} live across the UK, with{" "}
                {coverageCities.filter((c) => c.status === "waitlist").length}{" "}
                more on the waitlist. Hover any pin for details.
              </p>
            </div>
            <div className="mt-8">
              <CoverageMap
                cities={coverageCities}
                height="480px"
                initialBounds="all"
              />
            </div>
            <div className="mt-6 flex justify-center">
              <Link
                href="/coverage"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-600 transition"
              >
                See full coverage map →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Download the App */}

      {/* FAQ */}
      <section className="px-6 py-16 bg-slate-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold text-slate-900">
              Frequently asked
            </h2>
            <p className="mt-3 text-slate-600">
              The most common questions from families and caregivers.
            </p>
          </div>
          <div className="mt-10 space-y-3">
            {HOMEPAGE_FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-slate-100 bg-white px-5 py-4 open:shadow-sm"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-medium text-slate-900">
                  <span>{f.q}</span>
                  <span className="text-slate-400 group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
          <div className="mt-8 text-center text-sm text-slate-500">
            Still have a question?{" "}
            <Link href="/contact" className="text-brand-700 hover:underline">
              Get in touch
            </Link>
            .
          </div>
        </div>
      </section>

      {/* Latest from blog */}
      {recentPosts.length > 0 && (
        <section className="px-6 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-3xl font-semibold text-slate-900">
                  From the SpecialCarers blog
                </h2>
                <p className="mt-3 text-slate-600 max-w-2xl">
                  Practical guides, policy updates, and stories from inside the
                  care economy.
                </p>
              </div>
              <Link
                href="/blog"
                prefetch={false}
                className="inline-flex items-center min-h-[44px] py-2 text-sm text-brand-700 font-medium hover:underline"
              >
                Read all posts →
              </Link>
            </div>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentPosts.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  prefetch={false}
                  className="group bg-white p-6 rounded-2xl border border-slate-100 hover:border-brand-100 hover:shadow-sm transition flex flex-col"
                >
                  <div className="text-xs text-slate-500">
                    {new Date(p.publishedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {p.readingTimeMin ? ` · ${p.readingTimeMin} min read` : ""}
                  </div>
                  <h3 className="mt-2 font-semibold text-lg text-slate-900 group-hover:text-brand-700 transition">
                    {p.title}
                  </h3>
                  {p.excerpt && (
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed line-clamp-3">
                      {p.excerpt}
                    </p>
                  )}
                  <span className="mt-4 inline-block text-sm text-brand-700 font-medium group-hover:underline">
                    Read more →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Caregiver acquisition */}
      <section className="px-6 py-16 bg-brand-50">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-semibold text-slate-900">
            Earn more. Pick your shifts.
          </h2>
          <p className="mt-3 text-slate-700 max-w-2xl mx-auto">
            Caregivers keep 70% of every shift. We handle scheduling, payments,
            insurance support, and disputes — so you can focus on care.
          </p>
          <Link
            href="/become-a-caregiver"
            className="mt-8 inline-block px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
          >
            Apply to caregive
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-slate-900">
            Ready when you are.
          </h2>
          <p className="mt-4 text-slate-600 max-w-xl mx-auto">
            Find a vetted caregiver near you in minutes. No subscription, no
            hidden fees — pay only for the shifts you book.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/find-care"
              className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
            >
              Find care near me
            </Link>
            <Link
              href="/how-it-works"
              className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>
      <section className="relative overflow-hidden px-6 py-20 bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 text-white">
        {/* Decorative blobs */}
        <div aria-hidden="true" className="sc-blob-drift-a pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
        <div aria-hidden="true" className="sc-blob-drift-b pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

        {/* Hero teaser video — gives the section a strong emotional opener before the supporting phone mockups */}
        <div className="relative max-w-6xl mx-auto mb-12 lg:mb-16">
          <HeroTeaserVideo />
        </div>

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy + store badges */}
          <div className="order-2 lg:order-1">
            {/* Status pill — flips automatically when NEXT_PUBLIC_TESTFLIGHT_URL is set */}
            {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white ring-1 ring-white/30">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Beta is live
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white ring-1 ring-white/30">
                Coming soon
              </span>
            )}

            <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              Download the App
            </h2>
            <p className="mt-5 text-lg text-white/90 leading-relaxed">
              <span className="font-semibold text-white">
                SpecialCarers connects you with trusted, verified caregivers
                who offer reliable and heartfelt support.
              </span>{" "}
              We make care simple, safe, and deeply meaningful—built on trust
              and genuine connection.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
              {/* App Store — TestFlight beta if URL set, else Coming soon */}
              {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
                <a
                  href={process.env.NEXT_PUBLIC_TESTFLIGHT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full sm:w-auto items-center justify-center sm:justify-start gap-3 rounded-xl bg-slate-900 px-5 py-3 text-white shadow-sm hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                  aria-label="Join the TestFlight beta on iOS"
                >
                  <svg
                    viewBox="0 0 384 512"
                    aria-hidden="true"
                    className="h-7 w-7 fill-white"
                  >
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                  </svg>
                  <span className="text-left leading-tight">
                    <span className="block text-[10px] uppercase tracking-wider opacity-80">
                      Join the iOS beta on
                    </span>
                    <span className="block text-lg font-semibold">TestFlight</span>
                  </span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="flex w-full sm:w-auto items-center justify-center sm:justify-start gap-3 rounded-xl bg-slate-900 px-5 py-3 text-white shadow-sm cursor-not-allowed opacity-90"
                  aria-label="Download on the App Store — coming soon"
                >
                  <svg
                    viewBox="0 0 384 512"
                    aria-hidden="true"
                    className="h-7 w-7 fill-white"
                  >
                    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                  </svg>
                  <span className="text-left leading-tight">
                    <span className="block text-[10px] uppercase tracking-wider opacity-80">
                      Coming soon on the
                    </span>
                    <span className="block text-lg font-semibold">App Store</span>
                  </span>
                </button>
              )}

              {/* Google Play — Coming soon */}
              <div className="w-full sm:w-auto relative group">
                <button
                  type="button"
                  disabled
                  className="flex w-full sm:w-auto items-center justify-center sm:justify-start gap-3 rounded-xl bg-slate-900 px-5 py-3 text-white shadow-sm cursor-not-allowed opacity-90 hover:opacity-100 transition"
                  aria-label="Get it on Google Play — coming soon"
                >
                  <svg
                    viewBox="0 0 512 512"
                    aria-hidden="true"
                    className="h-7 w-7"
                  >
                    <path
                      fill="#039EA0"
                      d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1z"
                    />
                    <path
                      fill="#039EA0"
                      opacity="0.85"
                      d="m104.6 499 220.7-221.3 60.1 60.1L104.6 499z"
                    />
                    <path
                      fill="#039EA0"
                      opacity="0.7"
                      d="m484 256-98.6 56.6-65.4-65.4 65.4-65.4z"
                    />
                    <path
                      fill="#039EA0"
                      opacity="0.55"
                      d="M104.6 13c-7.4 4.3-12.4 12.7-12.4 23.6v440c0 10.9 5 19.3 12.4 23.6L325.3 277.7l-60.1-60.1z"
                    />
                  </svg>
                  <span className="text-left leading-tight">
                    <span className="block text-[10px] uppercase tracking-wider opacity-80">
                      Coming soon to
                    </span>
                    <span className="block text-lg font-semibold">
                      Google Play
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Footer microcopy — adapts to launch state */}
            {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
              <p className="mt-5 text-sm text-white/80">
                The iOS beta is open now via TestFlight. On Android?{" "}
                <Link
                  href="/contact?subject=app-beta"
                  className="text-white underline-offset-2 hover:underline font-medium"
                >
                  Get notified when the Android beta opens
                </Link>
                .
              </p>
            ) : (
              <p className="mt-5 text-sm text-white/80">
                Want to be among the first to try the app?{" "}
                <Link
                  href="/contact?subject=app-beta"
                  className="text-white underline-offset-2 hover:underline font-medium"
                >
                  Join the beta
                </Link>
                .
              </p>
            )}
          </div>

          {/* Phone mockups — animated splash + browse screens */}
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[520px] aspect-[5/4]">
              {/* Soft teal blob backdrop */}
              <div
                aria-hidden="true"
                className="absolute inset-[8%] rounded-[40%] bg-white/15 blur-2xl"
              />
              <div
                aria-hidden="true"
                className="absolute inset-[12%] rounded-[40%] bg-white/10"
              />

              {/* Splash phone (back, tilted left) */}
              <div className="absolute left-[2%] top-[6%] w-[44%] z-10">
                <AnimatedSplashPhone />
              </div>

              {/* Browse phone (front, tilted right) */}
              <div className="absolute right-[2%] top-[2%] w-[50%] z-20">
                <AnimatedBrowsePhone />
              </div>
            </div>
          </div>

        </div>
      </section>
    </MarketingShell>
  );
}

function Tick() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="inline-block w-4 h-4 mr-1.5 -mt-0.5 text-emerald-600"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const HOMEPAGE_FAQ = [
  {
    q: "How does SpecialCarers vet caregivers?",
    a: "Every caregiver completes identity verification with a selfie match, plus an Enhanced DBS check via the UK Disclosure and Barring Service, refreshed annually. We also verify right-to-work status. Profiles only go live once all checks have cleared.",
  },
  {
    q: "How does payment work?",
    a: "When you book, we authorise the payment but don\u2019t charge your card. Funds are held in escrow with Stripe until 24 hours after the shift ends. If anything goes wrong, you can dispute the booking before the hold is released.",
  },
  {
    q: "What does it cost?",
    a: "There\u2019s no subscription fee. Caregivers set their own hourly rate, and SpecialCarers takes a flat 30% platform fee — that covers payments, insurance support, dispute resolution, background checks, and live shift tracking. Caregivers keep 70%.",
  },
  {
    q: "What happens during a live shift?",
    a: "When the caregiver checks in, you get a real-time tracking link (powered by Mapbox) showing their location for the duration of the booking. There\u2019s also an in-app messaging thread per booking for quick coordination, and an SOS button for emergencies.",
  },
  {
    q: "Can I book the same caregiver again?",
    a: "Yes. Save caregivers you like to your favourites and rebook them in one click. Many of our families build long-term relationships with the same one or two caregivers.",
  },
  {
    q: "Where do you operate?",
    a: "We currently operate across the UK, with the broadest carer supply in London. New cities are being added monthly. International expansion is on our roadmap but not available at launch.",
  },
];

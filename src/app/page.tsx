import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import MarketingShell from "@/components/marketing-shell";
import CaregiverCard from "@/components/caregiver-card";
import HeroSearch from "@/components/hero-search";
import { ExplainerVideo } from "@/components/explainer-video";
import { HeroBanner } from "@/components/hero-banner";
import { searchCaregivers, listPublishedCities } from "@/lib/care/search";
import { CITIES } from "@/lib/care/cities";
import { getAllPosts } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title:
    "SpecialCarer — Vetted, on-demand caregivers for families in the UK & US",
  description:
    "Book trusted, background-checked caregivers for elderly care, childcare, special-needs and postnatal support. Live shift tracking, escrow payments, transparent pricing. Available across the UK and US.",
  alternates: { canonical: "https://specialcarer.com/" },
  openGraph: {
    title: "SpecialCarer — Vetted, on-demand caregivers for families",
    description:
      "Background-checked, on-demand carers for elderly care, childcare, special-needs and postnatal support. UK + US.",
    url: "https://specialcarer.com/",
    siteName: "SpecialCarer",
    type: "website",
  },
};

// Geo-personalisation reads request headers, so each render must be dynamic
export const dynamic = "force-dynamic";

export default async function Home() {
  // Detect visitor country via Vercel's edge header (falls back to GB)
  const reqHeaders = await headers();
  const ipCountry = (
    reqHeaders.get("x-vercel-ip-country") ||
    reqHeaders.get("cf-ipcountry") ||
    ""
  ).toUpperCase();
  const isUS = ipCountry === "US";

  const [featured, publishedCities] = await Promise.all([
    searchCaregivers({ limit: 6 }).then((r) => r.slice(0, 6)),
    listPublishedCities(),
  ]);
  const recentPosts = getAllPosts().slice(0, 3);

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
        name: "SpecialCarer",
        url: "https://specialcarer.com",
        logo: "https://specialcarer.com/icon.png",
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
        url: "https://specialcarer.com",
        name: "SpecialCarer",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://specialcarer.com/find-care?q={query}",
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

      {/* Hero banner video */}
      <HeroBanner isUS={isUS} />

      {/* Hero */}
      <section className="px-6 pt-12 pb-20 sm:pt-16 sm:pb-28 max-w-5xl mx-auto text-center">
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-slate-900">
          {isUS
            ? "Background-checked carers, on your schedule."
            : "Trusted care, on your schedule."}
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
          {isUS
            ? "On-demand and scheduled childcare, elder care, and special-needs support from Checkr-verified caregivers. Book in minutes. Track, message, and pay in one place."
            : "On-demand and scheduled childcare, elder care, and special-needs support from vetted, background-checked caregivers. Book in minutes. Track, message, and pay in one place."}
        </p>

        <HeroSearch cities={heroCities} />

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center text-sm">
          <Link
            href="/find-care"
            className="text-slate-600 hover:text-slate-900 transition"
          >
            Browse all caregivers
          </Link>
          <span className="hidden sm:inline text-slate-300">·</span>
          <Link
            href="/become-a-caregiver"
            className="text-slate-600 hover:text-slate-900 transition"
          >
            Apply as a caregiver
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Background checks via uCheck (UK) and Checkr (US). Payments held in
          escrow until shifts complete.
        </p>
      </section>

      {/* Pricing transparency strip */}
      <section className="px-6">
        <div className="max-w-5xl mx-auto rounded-2xl bg-brand-50 border border-brand-100 px-6 py-4 sm:px-8 sm:py-5">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-700">
            <span className="font-semibold text-brand-700">
              Honest pricing.
            </span>
            <span className={isUS ? "order-2" : "order-1"}>
              From £18/hr in the UK
            </span>
            <span className="text-slate-300">•</span>
            <span className={isUS ? "order-1" : "order-2"}>
              From $25/hr in the US
            </span>
            <span className="text-slate-300">•</span>
            <span>No subscription</span>
            <span className="text-slate-300">•</span>
            <span>Pay only for shifts you book</span>
            <span className="text-slate-300">•</span>
            <span>24h escrow before payout</span>
            <Link
              href="/pricing"
              className="text-brand-700 font-medium hover:underline"
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
              How SpecialCarer works
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
            { k: "100%", v: "Background-checked" },
            { k: "24h", v: "Average match time" },
            { k: "30%", v: "Flat platform fee" },
            { k: "UK + US", v: "Day-one coverage" },
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
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <section className="px-6 py-16">
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
                className="text-sm text-brand-700 font-medium hover:underline"
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
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { k: "Enhanced DBS", v: "UK background checks via uCheck" },
              { k: "Checkr-verified", v: "US national + county records" },
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
              className="text-sm text-brand-700 font-medium hover:underline"
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
              className="text-sm text-brand-700 font-medium hover:underline"
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
              What families say
            </h2>
            <p className="mt-3 text-slate-600">
              Stories from early users across the UK and US.
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
                q: "I\u2019ve worked through agencies for ten years. SpecialCarer is the first platform where I keep most of what I earn — and I pick my own shifts.",
                n: "Aisha R.",
                d: "Caregiver · Los Angeles",
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

      {/* Comparison: SpecialCarer vs Care.com vs traditional agency */}
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
                    SpecialCarer
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
                      v: "Premium required to message most carers ($38.99/mo)",
                      bad: true,
                    },
                  },
                  {
                    label: "Background checks",
                    sc: {
                      v: "Enhanced DBS (uCheck, UK) or Checkr (US) — we pay",
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
            . Agency markup ranges based on UK CQC and US senior-care
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
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 items-center justify-center">
            {[
              { name: "Stripe", note: "Payments + escrow" },
              { name: "uCheck", note: "UK background checks" },
              { name: "Checkr", note: "US background checks" },
              { name: "Mapbox", note: "Live shift tracking" },
            ].map((p) => (
              <div
                key={p.name}
                className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center"
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
                <li>• UK + US single contract</li>
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

      {/* Where we cover */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-semibold text-slate-900">
              Where we cover
            </h2>
            <p className="mt-3 text-slate-600">
              Live in cities across the UK and US, with new ones every month.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              { slug: "london", country: "uk", label: "London" },
              { slug: "manchester", country: "uk", label: "Manchester" },
              { slug: "birmingham", country: "uk", label: "Birmingham" },
              { slug: "new-york", country: "us", label: "New York" },
              { slug: "los-angeles", country: "us", label: "Los Angeles" },
            ].map((c) => (
              <Link
                key={c.slug}
                href={`/care-in/${c.country}/${c.slug}`}
                className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm text-slate-700 hover:bg-slate-100 transition"
              >
                {c.label}
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

      {/* Download the App */}
      <section className="px-6 py-20 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy + store badges */}
          <div className="order-2 lg:order-1">
            {/* Status pill — flips automatically when NEXT_PUBLIC_TESTFLIGHT_URL is set */}
            {process.env.NEXT_PUBLIC_TESTFLIGHT_URL ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-200">
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-600" />
                </span>
                Beta is live
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200">
                Coming soon
              </span>
            )}

            <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
              Download the App
            </h2>
            <p className="mt-5 text-lg text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-900">
                Special Carer connects you with trusted, verified caregivers
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
              <p className="mt-5 text-sm text-slate-500">
                The iOS beta is open now via TestFlight. On Android?{" "}
                <Link
                  href="/contact?subject=app-beta"
                  className="text-brand-700 hover:underline font-medium"
                >
                  Get notified when the Android beta opens
                </Link>
                .
              </p>
            ) : (
              <p className="mt-5 text-sm text-slate-500">
                Want to be among the first to try the app?{" "}
                <Link
                  href="/contact?subject=app-beta"
                  className="text-brand-700 hover:underline font-medium"
                >
                  Join the beta
                </Link>
                .
              </p>
            )}
          </div>

          {/* Phone mockup */}
          <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
            <div className="relative">
              {/* Soft brand backdrop */}
              <div
                aria-hidden="true"
                className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-brand-50 via-brand-100/60 to-white blur-2xl"
              />
              <div
                aria-hidden="true"
                className="sc-blob-drift-a absolute -top-6 -right-6 w-24 h-24 rounded-full bg-brand-500/15 blur-xl"
              />
              <div
                aria-hidden="true"
                className="sc-blob-drift-b absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-brand-700/10 blur-xl"
              />

              {/* Phone frame — gentle floating motion */}
              <div className="sc-phone-float relative w-[260px] sm:w-[300px] aspect-[9/19] rounded-[3rem] bg-slate-900 p-3 shadow-2xl shadow-brand-900/20 ring-1 ring-slate-800">
                <div className="relative h-full w-full rounded-[2.4rem] overflow-hidden bg-white">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-6 pt-3 pb-2 text-[10px] font-semibold text-slate-700">
                    <span>9:41</span>
                    <div className="flex items-center gap-1">
                      <span>●●●●</span>
                    </div>
                  </div>
                  {/* Notch */}
                  <div
                    aria-hidden="true"
                    className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-slate-900"
                  />

                  {/* App content mock */}
                  <div className="px-5 pt-6 pb-4">
                    {/* Real SpecialCarer brand mark with breathing animation */}
                    <div className="flex items-center gap-2">
                      <div
                        aria-label="SpecialCarer"
                        className="sc-logo-breathe w-9 h-9 rounded-xl bg-white ring-1 ring-brand-100 shadow-sm flex items-center justify-center"
                      >
                        <svg
                          viewBox="20 8 120 75"
                          className="w-7 h-7"
                          aria-hidden="true"
                          fill="none"
                        >
                          <path
                            fill="#039EA0"
                            d="M44.6227 66.5641C50.1119 62.2817 53.0352 51.5727 53.6328 47.677C54.2303 43.7753 55.7125 38.7606 57.3176 36.0307C58.9228 33.3066 62.4319 28.0048 60.8736 25.4565C60.8736 25.4565 61.1372 23.8044 60.0417 23.0077C58.9462 22.211 57.3645 23.7986 57.054 24.3024C57.054 24.3024 56.4682 24.2321 55.4078 25.8021C54.3475 27.3721 52.1565 30.8578 51.5003 31.842C50.8442 32.8262 50.2935 34.7243 49.8659 35.5386C49.4441 36.3529 48.7938 39.0946 45.6245 41.6664C45.6245 41.6664 48.1846 38.8544 49.198 35.234C50.2115 31.6135 51.7874 30.1255 52.3381 29.3464C52.8888 28.5672 54.9919 25.4447 55.5777 24.73C56.1577 24.0153 56.9134 23.8513 56.9134 23.8513C56.9134 23.8513 57.798 22.6269 59.0048 22.3633C60.2116 22.0997 61.7348 23.2127 61.272 25.3276C61.272 25.3276 62.8772 27.1729 61.0435 30.5063C59.2099 33.8397 56.7377 38.2275 55.8706 40.4947C55.0095 42.756 54.7107 44.0097 54.7107 44.0097C54.7107 44.0097 57.3176 42.4982 58.501 41.8011C59.6902 41.104 62.8654 39.364 64.3652 38.1338C65.8649 36.9036 69.7197 34.2322 69.6142 32.1642C69.6142 32.1642 63.7032 35.3687 62.4319 36.0893C61.1665 36.804 58.8174 38.2803 57.757 38.7489C57.757 38.7489 59.5438 37.3781 60.6451 36.6341C61.7465 35.8901 68.2375 32.4747 69.9598 31.5608C71.688 30.6411 78.6535 27.4131 76.5914 23.74C76.5914 23.74 72.6664 26.1595 70.1883 27.3604C67.7103 28.5614 65.1912 29.7096 64.6874 30.0025C64.1777 30.2954 61.3774 32.0412 60.5045 32.5509C60.5045 32.5509 62.7834 30.8637 63.4688 30.4184C64.1543 29.9673 71.6705 25.8958 72.9241 25.2221C74.1837 24.5484 77.8217 23.0136 78.7238 21.3732C79.6319 19.7329 79.4151 17.7294 78.1732 17.1728C76.9254 16.6104 71.8169 20.6937 68.7823 22.0352C65.7419 23.3768 63.6915 23.6345 62.76 24.2555C61.8285 24.8823 61.5649 25.1343 61.5649 25.1343C61.5649 25.1343 62.6253 24.0622 63.1408 23.5877C63.6563 23.1131 68.7472 18.2918 69.9247 16.5929C71.1022 14.894 70.9557 12.1991 69.8251 11.1505C68.6944 10.1019 66.5034 13.5114 65.4255 14.6479C64.3476 15.7844 57.757 20.5589 55.6597 22.3984C53.5625 24.2379 49.0692 28.8894 47.3058 30.0552C45.5425 31.221 44.2478 31.6252 43.0175 34.2673C41.7873 36.9094 38.5652 45.5973 37.458 51.0338C34.4234 65.9021 28.8522 71.5202 28.858 71.5202C32.455 70.8993 39.1218 70.8524 44.611 66.57L44.6227 66.5641Z"
                          />
                          <path
                            fill="#039EA0"
                            d="M81.7934 21.3736C82.7014 23.0139 86.3394 24.5488 87.5931 25.2225C88.8526 25.8962 96.363 29.9677 97.0484 30.4188C97.7338 30.8699 100.013 32.5512 100.013 32.5512C99.1398 32.0415 96.3337 30.2899 95.8299 30.0028C95.3202 29.7099 92.8011 28.5617 90.3289 27.3607C87.8509 26.1598 83.9258 23.7403 83.9258 23.7403C81.8637 27.4135 88.8351 30.6472 90.5574 31.5611C92.2856 32.4809 98.7707 35.8963 99.8721 36.6344C100.973 37.3784 102.76 38.7493 102.76 38.7493C101.7 38.2806 99.3507 36.8043 98.0853 36.0896C96.8199 35.3749 90.903 32.1645 90.903 32.1645C90.7976 34.2325 94.6582 36.9098 96.1521 38.1341C97.6518 39.3644 100.827 41.1043 102.016 41.8014C103.205 42.4986 105.807 44.01 105.807 44.01C105.807 44.01 105.508 42.7563 104.647 40.495C103.785 38.2337 101.307 33.84 99.4737 30.5066C97.6401 27.1733 99.2453 25.3279 99.2453 25.3279C98.7883 23.2131 100.311 22.1 101.512 22.3636C102.719 22.6272 103.604 23.8516 103.604 23.8516C103.604 23.8516 104.354 24.0215 104.94 24.7304C105.519 25.4451 107.628 28.5617 108.179 29.3467C108.73 30.1259 110.306 31.6139 111.319 35.2343C112.339 38.8547 114.893 41.6667 114.893 41.6667C111.723 39.0891 111.073 36.3532 110.651 35.5389C110.23 34.7246 109.679 32.8265 109.017 31.8423C108.361 30.8581 106.17 27.3725 105.109 25.8024C104.049 24.2324 103.463 24.3027 103.463 24.3027C103.153 23.7989 101.571 22.2113 100.475 23.008C99.38 23.8048 99.6436 25.4568 99.6436 25.4568C98.0853 28.0052 101.6 33.3011 103.2 36.031C104.805 38.7551 106.287 43.7757 106.884 47.6773C107.482 51.5789 110.405 62.282 115.895 66.5645C121.384 70.8469 128.05 70.8937 131.647 71.5147C131.647 71.5147 126.082 65.8966 123.048 51.0283C121.934 45.5918 118.718 36.9098 117.488 34.2618C116.258 31.6197 114.963 31.2155 113.2 30.0497C111.436 28.8839 106.943 24.2383 104.846 22.3929C102.749 20.5534 96.1579 15.7789 95.08 14.6424C94.0021 13.5059 91.8111 10.0964 90.6804 11.145C89.5498 12.1936 89.4033 14.8826 90.5808 16.5873C91.7584 18.2862 96.8492 23.1135 97.3647 23.5821C97.8803 24.0567 98.9406 25.1287 98.9406 25.1287C98.9406 25.1287 98.677 24.8768 97.7455 24.25C96.8141 23.6232 94.7637 23.3712 91.7232 22.0297C88.6827 20.6881 83.5743 16.6049 82.3324 17.1673C81.0845 17.7297 80.8736 19.7274 81.7817 21.3677L81.7934 21.3736Z"
                          />
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">
                        Special Carer
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-slate-900 leading-snug">
                      Find a trusted carer near you
                    </h3>
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 text-slate-400"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                      <span className="text-xs text-slate-500">
                        Postcode or city
                      </span>
                    </div>

                    {/* Carer cards — staggered rise */}
                    <div className="mt-4 space-y-2">
                      {[
                        { n: "Aisha R.", t: "Childcare · Verified", r: "4.9" },
                        { n: "Steve G.", t: "Elderly care · DBS", r: "4.8" },
                        { n: "Maria K.", t: "Special needs", r: "5.0" },
                      ].map((c, i) => (
                        <div
                          key={c.n}
                          className="sc-card-rise flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm"
                          style={{ animationDelay: `${0.2 + i * 0.18}s` }}
                        >
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-100 to-brand-300" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-900 truncate">
                              {c.n}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {c.t}
                            </div>
                          </div>
                          <div className="text-[10px] font-semibold text-amber-600">
                            ★ {c.r}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* CTA — subtle teal shimmer */}
                    <button className="sc-cta-shimmer mt-4 w-full rounded-xl text-white text-xs font-semibold py-2.5 shadow-sm">
                      Book a visit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
                  From the SpecialCarer blog
                </h2>
                <p className="mt-3 text-slate-600 max-w-2xl">
                  Practical guides, policy updates, and stories from inside the
                  care economy.
                </p>
              </div>
              <Link
                href="/blog"
                className="text-sm text-brand-700 font-medium hover:underline"
              >
                Read all posts →
              </Link>
            </div>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {recentPosts.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
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
    q: "How does SpecialCarer vet caregivers?",
    a: "Every caregiver completes identity verification with a selfie match, plus full background checks — Enhanced DBS via uCheck for the UK and Checkr (national + county) for the US. We also verify right-to-work status. Profiles only go live once all checks have cleared.",
  },
  {
    q: "How does payment work?",
    a: "When you book, we authorise the payment but don\u2019t charge your card. Funds are held in escrow with Stripe until 24 hours after the shift ends. If anything goes wrong, you can dispute the booking before the hold is released.",
  },
  {
    q: "What does it cost?",
    a: "There\u2019s no subscription fee. Caregivers set their own hourly rate, and SpecialCarer takes a flat 30% platform fee — that covers payments, insurance support, dispute resolution, background checks, and live shift tracking. Caregivers keep 70%.",
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
    q: "Do you cover the UK and US?",
    a: "Yes — both markets from day one. We\u2019re actively live in major UK and US metros, with new cities going live every month. Background checks, payments, and tax handling are localised to each region.",
  },
];

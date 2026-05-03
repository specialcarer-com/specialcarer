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
            { k: "20%", v: "Flat platform fee" },
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
                    sc: { v: "20% flat — transparent at checkout", good: true },
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
            Caregivers keep 80% of every shift. We handle scheduling, payments,
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
    a: "There\u2019s no subscription fee. Caregivers set their own hourly rate, and SpecialCarer takes a flat 20% platform fee — that covers payments, insurance support, dispute resolution, background checks, and live shift tracking. Caregivers keep 80%.",
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

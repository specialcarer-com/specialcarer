import Link from "next/link";
import type { Metadata } from "next";
import MarketingShell from "@/components/marketing-shell";
import CaregiverCard from "@/components/caregiver-card";
import HeroSearch from "@/components/hero-search";
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

// Re-fetch caregivers on every request so freshly-published profiles surface
export const revalidate = 60;

export default async function Home() {
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

      {/* Hero */}
      <section className="px-6 py-20 sm:py-28 max-w-5xl mx-auto text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium mb-6">
          Available across the UK and US
        </span>
        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-slate-900">
          Trusted care, on your schedule.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
          On-demand and scheduled childcare, elder care, and special-needs
          support from vetted, background-checked caregivers. Book in minutes.
          Track, message, and pay in one place.
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
            <span>From £15/hr in the UK</span>
            <span className="text-slate-300">•</span>
            <span>From $25/hr in the US</span>
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

      {/* Quick stats / credibility strip */}
      <section className="px-6 pb-4">
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

      {/* Recognition / press strip */}
      <section className="px-6 py-12 border-t border-slate-100">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs uppercase tracking-wider text-slate-500">
            Backed by, partnered with &amp; built on
          </p>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-center justify-center">
            {[
              { name: "Stripe", note: "Payments + escrow" },
              { name: "uCheck", note: "UK background checks" },
              { name: "Checkr", note: "US background checks" },
              { name: "Mapbox", note: "Live shift tracking" },
              { name: "Companies House", note: "Reg. 09428739" },
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

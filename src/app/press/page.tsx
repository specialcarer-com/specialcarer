import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Press & media — SpecialCarer",
  description:
    "Newsroom, brand assets, key facts and press contact for SpecialCarer — the on-demand, vetted-caregiver marketplace from All Care 4 U Group Limited.",
  alternates: { canonical: "https://specialcarer.com/press" },
  openGraph: {
    title: "Press & media — SpecialCarer",
    description:
      "Newsroom, brand assets, key facts and press contact for SpecialCarer.",
    url: "https://specialcarer.com/press",
    siteName: "SpecialCarer",
    type: "website",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpecialCarer — trusted care, on your schedule",
      },
    ],
  },
};

const FACTS: { k: string; v: string }[] = [
  { k: "Product", v: "SpecialCarer — on-demand caregiver marketplace" },
  { k: "Operating company", v: "All Care 4 U Group Limited" },
  { k: "Companies House", v: "09428739 (England & Wales, incorporated 9 February 2015)" },
  { k: "Registered office", v: "85 Great Portland Street, London, England, W1W 7LT" },
  { k: "Markets", v: "United Kingdom and United States" },
  { k: "Care verticals", v: "Elderly care, childcare, special-needs, postnatal" },
  { k: "Background checks", v: "uCheck (UK Enhanced DBS, right-to-work, digital ID), Checkr (US national + county criminal, healthcare sanctions)" },
  { k: "Payments", v: "Stripe Connect — manual capture, 24-hour escrow hold post-shift" },
  { k: "Live tracking", v: "Mapbox — real-time location during active bookings" },
  { k: "Take rate", v: "Flat 30% platform fee. Caregivers keep 70%." },
];

const STORIES: { angle: string; pitch: string }[] = [
  {
    angle: "The vetting gap in informal care",
    pitch:
      "Most family hires of carers happen via word-of-mouth or social media, with little formal vetting. SpecialCarer publishes the ID-verification, background-check, and right-to-work evidence inside every caregiver profile.",
  },
  {
    angle: "What a 30% platform fee actually buys",
    pitch:
      "We can break down the unit economics: how the 30% covers Stripe processing, escrow, background-check costs, dispute resolution, insurance support, and engineering — and what caregivers actually take home compared with traditional agencies.",
  },
  {
    angle: "Backup care as employee benefit",
    pitch:
      "We work with HR teams running absenteeism and retention programmes. Subsidised on-demand care for elder, child, and special-needs cover keeps parents and family carers in the workforce. Available data on what drives uptake.",
  },
  {
    angle: "Single-contract UK + US care benefit",
    pitch:
      "Most cross-border employers struggle to roll out a single care-benefit programme across their UK and US workforce. SpecialCarer ships day-one in both markets with localised checks, payouts and tax handling.",
  },
];

const ASSETS: { name: string; href: string; note: string }[] = [
  {
    name: "Wordmark — full colour (PNG)",
    href: "/icon.png",
    note: "Primary lockup. Use on light backgrounds.",
  },
  {
    name: "Brand colour swatches",
    href: "/press#colours",
    note: "Brand teal #0EA597, ink #0F172A, surface #F8FAFC.",
  },
  {
    name: "Founder & company bio",
    href: "/about",
    note: "About page — short and long versions of the company narrative.",
  },
];

export default function Page() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "Press & media — SpecialCarer",
    url: "https://specialcarer.com/press",
    mainEntity: {
      "@type": "Organization",
      name: "SpecialCarer",
      legalName: "All Care 4 U Group Limited",
      taxID: "09428739",
      url: "https://specialcarer.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "85 Great Portland Street",
        addressLocality: "London",
        postalCode: "W1W 7LT",
        addressCountry: "GB",
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "press",
        email: "press@specialcarer.com",
        availableLanguage: ["English"],
      },
    },
  };

  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      {/* Hero */}
      <section className="px-6 py-16 sm:py-24 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          Press &amp; media
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          A newsroom for the people writing about the care economy.
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed">
          Resources for journalists, analysts, and partners covering
          SpecialCarer and the broader vetted-caregiver market in the UK and
          US. For interview requests or quick comment, the press contact is
          below.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <a
            href="mailto:press@specialcarer.com"
            className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition text-center"
          >
            Email press@specialcarer.com
          </a>
          <Link
            href="/about"
            className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition text-center"
          >
            About the company
          </Link>
        </div>
      </section>

      {/* Press contact */}
      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xs uppercase tracking-wider text-slate-500">
              Press contact
            </h2>
            <p className="mt-2 font-semibold text-slate-900">
              SpecialCarer Communications
            </p>
            <p className="text-slate-600 text-sm mt-1">
              <a
                href="mailto:press@specialcarer.com"
                className="text-brand-700 hover:underline"
              >
                press@specialcarer.com
              </a>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              We aim to respond within one UK business day. For tight
              deadlines, write &ldquo;Deadline&rdquo; in the subject line.
            </p>
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-wider text-slate-500">
              Operating company
            </h2>
            <p className="mt-2 font-semibold text-slate-900">
              All Care 4 U Group Limited
            </p>
            <p className="text-slate-600 text-sm mt-1">
              85 Great Portland Street, London, England, W1W 7LT
            </p>
            <p className="text-slate-500 text-xs mt-1">
              Registered in England &amp; Wales, company no. 09428739.
              Incorporated 9 February 2015.
            </p>
          </div>
        </div>
      </section>

      {/* About — short version */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            About SpecialCarer (50-word boilerplate)
          </h2>
          <p className="mt-4 text-slate-600 leading-relaxed">
            SpecialCarer is an on-demand marketplace for vetted, background-checked
            caregivers across the United Kingdom and United States. Families
            book elderly care, childcare, special-needs and postnatal support
            in minutes, with live shift tracking, escrow payments, and a flat
            30% platform fee. SpecialCarer is a product of All Care 4 U Group
            Limited.
          </p>
          <h2 className="mt-10 text-2xl font-semibold text-slate-900">
            About SpecialCarer (long version)
          </h2>
          <div className="mt-4 space-y-4 text-slate-600 leading-relaxed">
            <p>
              SpecialCarer is building a trusted way to find, book and pay
              caregivers — across childcare, elderly care, special-needs
              support, and postnatal care. Every caregiver completes
              identity verification, full background checks, and right-to-work
              verification before their profile goes live. UK checks run
              through uCheck (Enhanced DBS, digital ID) and US checks run
              through Checkr (national + county criminal records, healthcare
              sanctions screening).
            </p>
            <p>
              Bookings are paid through Stripe in escrow: payments are
              authorised when a shift is booked, captured when it ends, and
              held for 24 hours before payout — giving families a window to
              raise disputes. Caregivers keep 70% of every shift. The platform
              also includes live shift tracking via Mapbox, in-app
              per-booking messaging, post-shift reviews, and an in-app SOS
              button for active-shift emergencies.
            </p>
            <p>
              SpecialCarer launched simultaneously in the United Kingdom and
              United States, with localised background checks, payments and
              tax handling for each region. The platform is also offered to
              employers as a backup-care benefit, with per-employee or
              pooled-credit plans designed to reduce absenteeism and improve
              retention of working parents and family carers.
            </p>
          </div>
        </div>
      </section>

      {/* Key facts */}
      <section className="px-6 py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">Key facts</h2>
          <p className="mt-3 text-slate-600">
            Quick-reference facts journalists most often ask for. All figures
            and partner details accurate as of the date of this page.
          </p>
          <dl className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {FACTS.map((f) => (
              <div
                key={f.k}
                className="border-l-2 border-brand-100 pl-4 py-1"
              >
                <dt className="text-xs uppercase tracking-wider text-slate-500">
                  {f.k}
                </dt>
                <dd className="mt-1 text-sm text-slate-800 leading-relaxed">
                  {f.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Story angles */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Story angles we can support
          </h2>
          <p className="mt-3 text-slate-600">
            Topics where we can offer commentary, data, on-the-record sources,
            or briefings.
          </p>
          <div className="mt-8 grid sm:grid-cols-2 gap-5">
            {STORIES.map((s) => (
              <div
                key={s.angle}
                className="rounded-2xl border border-slate-100 bg-white p-6"
              >
                <h3 className="font-semibold text-slate-900">{s.angle}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {s.pitch}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand assets */}
      <section className="px-6 py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Brand assets
          </h2>
          <p className="mt-3 text-slate-600">
            Permitted for editorial use covering SpecialCarer. Please don&rsquo;t
            modify the wordmark, recolour the logo, or imply endorsement.
          </p>
          <div className="mt-8 grid sm:grid-cols-3 gap-5">
            {ASSETS.map((a) => (
              <a
                key={a.name}
                href={a.href}
                className="block rounded-2xl border border-slate-100 bg-white p-6 hover:border-brand-100 hover:shadow-sm transition"
              >
                <div className="font-semibold text-slate-900 text-sm">
                  {a.name}
                </div>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  {a.note}
                </p>
                <span className="mt-4 inline-block text-xs text-brand-700 font-medium">
                  Open →
                </span>
              </a>
            ))}
          </div>

          <div id="colours" className="mt-10">
            <h3 className="text-sm font-semibold text-slate-900">
              Brand colours
            </h3>
            <div className="mt-3 grid sm:grid-cols-3 gap-3">
              {[
                { name: "Brand teal", hex: "#0EA597", text: "text-white", bg: "bg-brand" },
                { name: "Ink", hex: "#0F172A", text: "text-white", bg: "bg-slate-900" },
                { name: "Surface", hex: "#F8FAFC", text: "text-slate-900", bg: "bg-slate-50 border border-slate-200" },
              ].map((c) => (
                <div
                  key={c.hex}
                  className={`rounded-xl ${c.bg} ${c.text} px-4 py-5 text-sm`}
                >
                  <div className="font-semibold">{c.name}</div>
                  <div className="opacity-80 text-xs mt-1">{c.hex}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Editorial guidance */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Editorial style
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-slate-700 leading-relaxed">
            <li>
              <strong>Capitalisation:</strong> &ldquo;SpecialCarer&rdquo; — one
              word, one capital S, one capital C.
            </li>
            <li>
              <strong>Operating company:</strong> &ldquo;All Care 4 U Group
              Limited&rdquo; — note the digit &ldquo;4&rdquo; and capital
              &ldquo;U&rdquo;.
            </li>
            <li>
              <strong>What we are:</strong> a marketplace, not an agency.
              Caregivers are independent professionals; SpecialCarer
              connects them with families and handles vetting, payments and
              dispute resolution.
            </li>
            <li>
              <strong>What we don&rsquo;t do:</strong> we do not provide
              medical advice or clinical care. We are not an introduction
              agency or a staffing firm.
            </li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-semibold">
            Working on a story?
          </h2>
          <p className="mt-3 text-slate-300">
            We&rsquo;re happy to help with quotes, briefings, or background.
          </p>
          <a
            href="mailto:press@specialcarer.com"
            className="mt-6 inline-block px-6 py-3 rounded-xl bg-white text-slate-900 font-medium hover:bg-slate-100 transition"
          >
            press@specialcarer.com
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}

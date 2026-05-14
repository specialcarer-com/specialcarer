import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";
import ContactForm from "./_components/ContactForm";

export const metadata: Metadata = {
  title: "For organisations — SpecialCarer",
  description:
    "Vetted carers for councils, NHS trusts, fostering agencies, residential homes, schools, and charities. Master Services Agreement and DPA in place. Strict verification of every buyer.",
  alternates: { canonical: "https://specialcarer.com/organisations" },
  robots: { index: true, follow: true },
  keywords: [
    "hire vetted carers organisation",
    "care staffing platform UK",
    "on-demand care staff for councils",
  ],
  openGraph: {
    title: "SpecialCarer for organisations",
    description:
      "Vetted carers for councils, NHS, fostering agencies, residential homes, schools and charities. MSA + DPA in place.",
    url: "https://specialcarer.com/organisations",
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
  twitter: {
    card: "summary_large_image",
    title: "SpecialCarer for organisations",
    description:
      "Vetted carers for councils, NHS, fostering agencies, residential homes, schools and charities.",
  },
};

const SECTORS = [
  { icon: "🏥", label: "NHS trusts & ICBs" },
  { icon: "🏛", label: "Local authorities & social services" },
  { icon: "👶", label: "Fostering agencies & children's homes" },
  { icon: "🏠", label: "Residential & domiciliary care providers" },
  { icon: "🎓", label: "Hospices, hospitals & SEN schools" },
  { icon: "❤️", label: "Charities & non-profits" },
];

const PROOF = [
  {
    title: "Vetted supply",
    body:
      "Every carer has Enhanced DBS / Checkr equivalent, Right to Work, references, and identity verification.",
    href: "/trust",
    cta: "How we vet carers →",
  },
  {
    title: "Compliant by default",
    body:
      "GDPR-compliant DPA, audit trail on every booking, safeguarding-aligned record keeping.",
    href: "/organisations/compliance",
    cta: "Compliance details →",
  },
  {
    title: "Built for procurement",
    body:
      "PO support, net-14 invoicing, framework pricing on request, single point of contact.",
    href: "/organisations/billing",
    cta: "Billing & invoicing →",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Sign up & verify",
    body:
      "We cross-check Companies House, CQC, Ofsted or Charity Commission as relevant.",
  },
  {
    n: 2,
    title: "Sign our MSA & DPA",
    body: "Clickwrap, 5 minutes. Read the live terms before you commit.",
  },
  {
    n: 3,
    title: "Browse & shortlist",
    body:
      "Filter by service, distance, certifications and rating. Save shortlists for your team.",
  },
  {
    n: 4,
    title: "Book on demand or by contract",
    body:
      "One-off bookings, 12-hour shifts, sleep-ins, or recurring contracts. Net-14 by default.",
  },
];

const SHIFT_MODES = [
  {
    title: "12-hour shifts",
    body: "For residential homes and dom care.",
  },
  {
    title: "Sleep-ins & overnight cover",
    body: "For complex care and SEN.",
  },
  {
    title: "Recurring contracts",
    body:
      "4-week rolling schedules with the same carer when continuity matters.",
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Are you registered with CQC?",
    a:
      "SpecialCarer is a staffing platform, not a registered care provider. The carers we connect you with operate as independent professionals and are vetted to CQC-equivalent standards. Where you operate a CQC-registered service, the carers fold into your existing regulatory framework.",
  },
  {
    q: "What pre-employment checks do your carers undergo?",
    a:
      "Identity + selfie verification; Enhanced DBS (UK) or Checkr equivalent (US); Right to Work; certifications upload with admin verification; references; signed code of conduct.",
  },
  {
    q: "Do you have a DPA we can review?",
    a:
      "Yes — our standard Data Processing Addendum is on /organisations/contracts/dpa. Need amendments for your procurement team? Talk to us at the bottom of this page.",
  },
  {
    q: "What is your liability insurance cover?",
    a:
      "We hold £5m public liability and £1m professional indemnity insurance. Certificates of insurance are available on request.",
  },
  {
    q: "What are your payment terms? Can we raise POs?",
    a:
      "Net-14 default, with net-7 / net-30 available. Per-booking and per-period POs are supported. Card-on-file for emergency bookings is optional.",
  },
  {
    q: "Can we have framework pricing for high-volume bookings?",
    a:
      "Framework pricing is available on request for buyers consistently above 200 hours per month. Get in touch via the form below.",
  },
  {
    q: "How do you handle safeguarding incidents?",
    a:
      "Every booking has an SOS button that pages our trust-and-safety team. We support you to make formal safeguarding referrals to the relevant local authority hub or APS, retain audit-quality records, and pause carer accounts when incidents are under review.",
  },
  {
    q: "What happens if a booked carer doesn't show up?",
    a:
      "We aim to find a replacement within 2 hours where carer availability allows. If we can't, you're not charged for the no-show and we record it on the carer's reliability score.",
  },
];

export default function OrganisationsPage() {
  return (
    <MarketingShell>
      <PageHeroBanner pageKey="audience.organisations" height="md" tint="soft" />
      {/* Hero */}
      <section className="px-6 pt-16 pb-10 sm:pt-24 sm:pb-14 max-w-4xl mx-auto text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          For organisations
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Vetted carers for your service users — on demand and under contract
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Councils, NHS trusts, fostering agencies, residential homes, schools, and
          charities — request safer-recruited carers when you need them, with a
          Master Services Agreement and DPA in place.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/m/org/register/step-1"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-pill bg-slate-900 text-white text-sm font-semibold shadow-sm hover:bg-slate-800 transition"
          >
            Get started
          </Link>
          <Link
            href="#contact"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-pill bg-white text-slate-900 text-sm font-semibold border border-slate-200 hover:border-slate-300 transition"
          >
            Talk to our team
          </Link>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          Strict verification. CQC / Ofsted / Charity Commission / Companies
          House cross-checked. GDPR-compliant DPA in place.
        </p>
      </section>

      {/* Sectors */}
      <section className="px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs uppercase tracking-wide text-slate-500">
            Who we work with
          </p>
          <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SECTORS.map((s) => (
              <li
                key={s.label}
                className="rounded-2xl bg-white border border-slate-200 px-4 py-3 flex items-center gap-3"
              >
                <span className="text-xl" aria-hidden>
                  {s.icon}
                </span>
                <span className="text-sm text-slate-800">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Proof bands */}
      <section className="px-6 py-10">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-3 gap-4">
          {PROOF.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl bg-white border border-slate-200 p-5"
            >
              <h3 className="font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {p.body}
              </p>
              <Link
                href={p.href}
                className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-12 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 text-center">
            How it works
          </h2>
          <ol className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-2xl bg-white border border-slate-200 p-5"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-sm font-bold">
                  {s.n}
                </span>
                <p className="mt-3 font-semibold text-slate-900">{s.title}</p>
                <p className="mt-1 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Long-form shift modes */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 text-center">
            Built for the way you actually staff.
          </h2>
          <ul className="mt-6 grid sm:grid-cols-3 gap-4">
            {SHIFT_MODES.map((m) => (
              <li
                key={m.title}
                className="rounded-2xl bg-white border border-slate-200 p-5"
              >
                <p className="font-semibold text-slate-900">{m.title}</p>
                <p className="mt-1 text-sm text-slate-600">{m.body}</p>
              </li>
            ))}
          </ul>
          {/* TODO: confirm Phase B GA quarter (current placeholder Q3 2026). */}
          <p className="mt-4 text-center text-xs text-slate-500">
            Long-form modes launch alongside organisation booking (Q3 2026).
            Verify your organisation now to be in the first wave.
          </p>
        </div>
      </section>

      {/* Pricing band */}
      <section className="px-6 py-12 bg-brand-50/40">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
            Same rates as our consumer platform. No surcharge for organisations.
          </h2>
          <p className="mt-4 text-slate-700 leading-relaxed">
            We charge carers a 25% platform fee. We do not add a markup to your
            invoice. Tips are passed 100% to the carer. Framework pricing is
            available on request for high-volume buyers (&gt;200 hrs/month).
          </p>
          <Link
            href="#contact"
            className="mt-5 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            Talk to us about framework pricing →
          </Link>
        </div>
      </section>

      {/* Compliance & safeguarding */}
      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 text-center">
            We only work with verified organisations.
          </h2>
          <p className="mt-4 max-w-3xl mx-auto text-center text-slate-700 leading-relaxed">
            We cross-check Companies House, CQC, Ofsted, Charity Commission, and
            equivalent US registries before a single booking is permitted. We
            require proof of address, public liability insurance, and an
            authorised signatory. Your service users are protected from fraud
            and unsuitable buyers.
          </p>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <Link
              href="/organisations/compliance"
              className="rounded-2xl bg-white border border-slate-200 p-5 hover:border-slate-900 transition"
            >
              <p className="font-semibold text-slate-900">
                Our verification process
              </p>
              <p className="mt-1 text-sm text-slate-600">
                What we check, what we require, and how long it takes.
              </p>
            </Link>
            <Link
              href="/organisations/contracts"
              className="rounded-2xl bg-white border border-slate-200 p-5 hover:border-slate-900 transition"
            >
              <p className="font-semibold text-slate-900">
                Read sample MSA &amp; DPA
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Real terms — read them before you sign up.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonial placeholder */}
      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-3xl mx-auto rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Testimonials
          </p>
          <p className="mt-3 text-slate-700 leading-relaxed">
            Coming soon — we&rsquo;re onboarding our first organisation
            partners. We&rsquo;d rather show you real customer voices than
            fabricated ones.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 text-center">
            Frequently asked questions
          </h2>
          <ul className="mt-6 space-y-2">
            {FAQS.map((f) => (
              <li key={f.q}>
                <details className="rounded-2xl bg-white border border-slate-200 p-5">
                  <summary className="cursor-pointer font-semibold text-slate-900">
                    {f.q}
                  </summary>
                  <p className="mt-3 text-slate-700 leading-relaxed">{f.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact + final CTA */}
      <section
        id="contact"
        className="px-6 py-16 bg-slate-50 border-t border-slate-100"
      >
        <div className="max-w-4xl mx-auto grid lg:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900">
              Get started
            </h2>
            <p className="mt-3 text-slate-700 leading-relaxed">
              The fastest path is self-serve registration. We&rsquo;ll verify
              your details and have you ready to book in around 2 business
              days.
            </p>
            <Link
              href="/m/org/register/step-1"
              className="mt-5 inline-block px-6 py-3 rounded-pill bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition"
            >
              Get started
            </Link>
            <p className="mt-6 text-sm text-slate-500">
              Prefer to talk first? Use the form. We typically reply within 1
              business day.
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-5">
            <ContactForm source="organisations_page" />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

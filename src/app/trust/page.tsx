import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Trust & Safety — SpecialCarer",
  description:
    "How SpecialCarer vets caregivers, protects payments, monitors live shifts, and resolves disputes. Background checks, insurance, and accountability.",
};

const pillars = [
  {
    title: "Identity verification",
    body:
      "Every caregiver completes ID + selfie verification before they can be matched. We re-verify identity yearly and after any significant profile change.",
  },
  {
    title: "Background checks",
    body:
      "UK caregivers complete an Enhanced DBS through uCheck (with Children's and/or Adults' Barred List as appropriate). US caregivers complete a Checkr screening covering national criminal database, county records (7+ years), and SSN trace. Specific check level depends on the role.",
  },
  {
    title: "Live shift tracking",
    body:
      "When a shift starts, both family and caregiver see real-time location during the booking window. Pings are recorded every 15 seconds. Tracking automatically ends 15 minutes after the scheduled end and location data is purged 30 days later.",
  },
  {
    title: "Escrow payments",
    body:
      "Payment is authorised when you book, captured at the start of the shift, and released to the caregiver only after the shift completes plus a 24-hour dispute window. If something goes wrong, your money stays put.",
  },
  {
    title: "In-app SOS",
    body:
      "An SOS button is one tap away during any active shift. SOS pages our 24/7 trust & safety team, captures a location snapshot, and — at your option — alerts your designated emergency contact.",
  },
  {
    title: "Two-way reviews",
    body:
      "Both family and caregiver review each other after every shift. Patterns of complaint trigger automated review and, where warranted, suspension pending investigation.",
  },
];

const insurance = [
  {
    geo: "UK",
    detail:
      "Caregivers are independent contractors and required to confirm they hold or are exempt from public liability cover. SpecialCarer Limited holds marketplace operator insurance covering platform-level negligence and a backstop for loss-of-property and bodily-injury claims up to limits set out in our T&Cs.",
  },
  {
    geo: "US",
    detail:
      "Caregivers operate as independent contractors on a state-by-state basis. We carry commercial general liability cover for marketplace operations. Caregivers are responsible for any state-specific licensing and cover for their work category (e.g. CNA / HHA).",
  },
];

export default function Page() {
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-24 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          Trust &amp; safety
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Six layers of safety, on every shift.
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed">
          You&rsquo;re inviting someone into your home — or trusting them with
          someone you love. We take that seriously. Here&rsquo;s exactly what we
          do, what we don&rsquo;t, and how we hold ourselves accountable.
        </p>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-6">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="bg-white p-6 rounded-2xl border border-slate-100"
              >
                <h2 className="font-semibold text-lg text-slate-900">
                  {p.title}
                </h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Insurance — the honest version
          </h2>
          <p className="mt-3 text-slate-600">
            Caregivers on SpecialCarer are independent contractors, not
            SpecialCarer employees. That keeps the platform open and rates
            competitive, but it means insurance works differently than with a
            traditional agency.
          </p>
          <div className="mt-6 space-y-4">
            {insurance.map((i) => (
              <div
                key={i.geo}
                className="bg-white p-5 rounded-xl border border-slate-100"
              >
                <h3 className="font-semibold text-slate-900">
                  {i.geo === "UK" ? "United Kingdom" : "United States"}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {i.detail}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Coverage limits and exclusions are detailed in our{" "}
            <Link href="/terms" className="text-brand-700 hover:underline">
              Terms of Service
            </Link>
            . If clarity matters for your situation, ask us before booking.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            What we don&rsquo;t do
          </h2>
          <p className="mt-3 text-slate-600">
            Being clear about our limits is part of being trustworthy.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            <li className="bg-white p-4 rounded-xl border border-slate-100">
              <strong className="text-slate-900">
                We are not a regulated care agency.
              </strong>{" "}
              SpecialCarer is a marketplace that introduces families to
              independent caregivers. We are not registered with CQC (UK) or
              equivalent state regulators (US). For CQC-regulated personal
              care, choose a registered provider.
            </li>
            <li className="bg-white p-4 rounded-xl border border-slate-100">
              <strong className="text-slate-900">
                We are not an emergency service.
              </strong>{" "}
              Dial 999 (UK) or 911 (US) for medical, fire, or police
              emergencies. Use in-app SOS for active-shift incidents.
            </li>
            <li className="bg-white p-4 rounded-xl border border-slate-100">
              <strong className="text-slate-900">
                We don&rsquo;t guarantee perfection.
              </strong>{" "}
              Background checks, training, and reviews dramatically reduce risk
              — they don&rsquo;t eliminate it. We commit to acting fast,
              transparently, and on the side of the family or caregiver who
              raises a concern.
            </li>
          </ul>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Reporting a safety concern
          </h2>
          <p className="mt-3 text-slate-600">
            If you feel unsafe during an active shift, use the in-app SOS button
            or call emergency services first. For non-emergency safety
            concerns, contact us directly:
          </p>
          <ul className="mt-4 text-sm text-slate-700 space-y-2">
            <li>
              <strong className="text-slate-900">Trust &amp; safety:</strong>{" "}
              <a
                className="text-brand-700 hover:underline"
                href="mailto:safety@specialcarer.com"
              >
                safety@specialcarer.com
              </a>
            </li>
            <li>
              <strong className="text-slate-900">
                Booking disputes / refunds:
              </strong>{" "}
              <a
                className="text-brand-700 hover:underline"
                href="mailto:disputes@specialcarer.com"
              >
                disputes@specialcarer.com
              </a>
            </li>
            <li>
              <strong className="text-slate-900">Safeguarding (UK):</strong> We
              work with local-authority safeguarding teams when concerns about
              children or vulnerable adults are raised. Reports of abuse are
              referred immediately and we cooperate fully with any safeguarding
              enquiry.
            </li>
          </ul>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto bg-brand text-white rounded-2xl px-8 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Questions? We&rsquo;d rather you ask now than wonder later.
          </h2>
          <Link
            href="/contact"
            className="mt-6 inline-block px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-brand-50 transition"
          >
            Contact our team
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

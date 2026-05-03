import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Become a caregiver — SpecialCarer",
  description:
    "Apply to caregive on SpecialCarer. Keep 80% of every shift. Free background check. Same-day payouts. UK + US.",
};

const reasons = [
  {
    t: "Keep 80% of every shift",
    c: "Most agencies take 40–60%. We take 20%, and that covers your background check, insurance backstop, payment processing, and 24/7 support.",
  },
  {
    t: "Free background check",
    c: "We pay for your Enhanced DBS (UK) or Checkr screening (US). Renewals are on us too.",
  },
  {
    t: "Same-day payouts",
    c: "Earnings hit your bank within 24 hours of shift completion via Stripe Connect — many banks even support same-day deposits.",
  },
  {
    t: "Pick your own shifts",
    c: "Set your hourly rate, your availability, your travel radius. Decline anything that doesn't fit.",
  },
  {
    t: "Free training",
    c: "Access to our training library: paediatric first aid refreshers, dementia care, manual handling, and more — at no cost.",
  },
  {
    t: "Real support",
    c: "If something goes wrong on a shift, we have your back. Trust & safety team is one tap away during any active booking.",
  },
];

const requirements = [
  "Right to work in the UK or US",
  "18 years or older",
  "Pass an Enhanced DBS (UK) or Checkr (US) background check",
  "Provide ID + selfie verification",
  "At least one verifiable reference",
  "Smartphone (iOS or Android)",
  "Bank account in your name",
  "For specialised work (postnatal, special-needs, eldercare with personal care): relevant training certificates",
];

export default function Page() {
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
              For caregivers
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
              Earn more. Keep more. Care better.
            </h1>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              SpecialCarer is the marketplace built for caregivers who want
              fair pay, reliable shifts, and the support of a team that
              actually has their back.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/onboarding"
                className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition text-center"
              >
                Apply to caregive
              </Link>
              <Link
                href="/how-it-works"
                className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition text-center"
              >
                How it works
              </Link>
            </div>
          </div>
          <div className="bg-slate-900 text-white rounded-3xl p-8 lg:p-10 grid grid-cols-2 gap-6">
            <div>
              <div className="text-4xl font-semibold">80%</div>
              <div className="mt-1 text-sm text-slate-300">of every shift</div>
            </div>
            <div>
              <div className="text-4xl font-semibold">£0</div>
              <div className="mt-1 text-sm text-slate-300">
                background check
              </div>
            </div>
            <div>
              <div className="text-4xl font-semibold">24h</div>
              <div className="mt-1 text-sm text-slate-300">payout window</div>
            </div>
            <div>
              <div className="text-4xl font-semibold">0</div>
              <div className="mt-1 text-sm text-slate-300">listing fees</div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Why caregivers choose us
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {reasons.map((r) => (
              <div
                key={r.t}
                className="bg-white p-6 rounded-2xl border border-slate-100"
              >
                <h3 className="font-semibold text-slate-900">{r.t}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {r.c}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            What you&rsquo;ll need
          </h2>
          <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm text-slate-700">
            {requirements.map((r) => (
              <li
                key={r}
                className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex gap-3"
              >
                <svg
                  className="w-5 h-5 flex-none text-brand mt-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{r}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Independent contractor model — you&rsquo;re responsible for your
            own taxes (UK self-assessment / US 1099). We provide annual earnings
            statements to help.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            How it works in 5 minutes
          </h2>
          <ol className="mt-6 space-y-4 text-sm text-slate-700">
            <li className="bg-white p-5 rounded-xl border border-slate-100">
              <strong className="text-slate-900">1. Apply.</strong> Tell us
              about your experience, certifications, and the kind of work you
              want.
            </li>
            <li className="bg-white p-5 rounded-xl border border-slate-100">
              <strong className="text-slate-900">2. Verify.</strong> ID +
              selfie, phone, and address. Then your background check kicks
              off — usually 1–5 days.
            </li>
            <li className="bg-white p-5 rounded-xl border border-slate-100">
              <strong className="text-slate-900">3. Build your profile.</strong>{" "}
              Upload certificates, set your rate, write a short intro for
              families.
            </li>
            <li className="bg-white p-5 rounded-xl border border-slate-100">
              <strong className="text-slate-900">4. Get matched.</strong> When
              a family books matching your filters, you get notified — accept
              or decline.
            </li>
            <li className="bg-white p-5 rounded-xl border border-slate-100">
              <strong className="text-slate-900">5. Get paid.</strong> Complete
              the shift, get reviewed, get paid within 24 hours.
            </li>
          </ol>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto bg-brand text-white rounded-2xl px-8 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Apply in 5 minutes.
          </h2>
          <p className="mt-3 text-brand-50">
            Background checks usually clear within 1–5 days. You can start
            booking shifts the moment they do.
          </p>
          <Link
            href="/onboarding"
            className="mt-6 inline-block px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-brand-50 transition"
          >
            Start your application
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export default function Home() {
  return (
    <MarketingShell>
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

        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/find-care"
            className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition"
          >
            Find care near me
          </Link>
          <Link
            href="/become-a-caregiver"
            className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition"
          >
            Apply as a caregiver
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Background checks via uCheck (UK) and Checkr (US). Payments held in
          escrow until shifts complete.
        </p>
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

      {/* Trust strip */}
      <section id="trust" className="px-6 py-16">
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
      <section className="px-6 py-16 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
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
    </MarketingShell>
  );
}

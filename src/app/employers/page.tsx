import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export const metadata: Metadata = {
  title: "For employers — backup care benefits | SpecialCarer",
  description:
    "Reduce parental absenteeism and improve retention with employer-sponsored backup childcare, elder care, and special-needs support. UK + US single contract.",
};

const stats = [
  { v: "1 in 4", l: "working parents reduce hours due to care gaps" },
  { v: "$22B", l: "annual lost productivity from US care breakdowns" },
  { v: "62%", l: "of carers say backup care would change retention" },
];

const features = [
  {
    t: "On-demand backup",
    c: "Employees can book a vetted caregiver in minutes when their usual arrangements fall through.",
  },
  {
    t: "Subsidised at your level",
    c: "You decide the subsidy: a fixed annual credit, a per-event cap, or pay-the-full-thing for senior staff.",
  },
  {
    t: "Per-employee or pooled",
    c: "Per-employee plans for transparency, pooled-credit plans for predictable spend.",
  },
  {
    t: "UK + US single contract",
    c: "One vendor, one invoice, one privacy framework — no managing separate providers across markets.",
  },
  {
    t: "Real reporting",
    c: "Anonymised quarterly reports on usage by region, role, and category. Tied to retention metrics.",
  },
  {
    t: "Wellbeing-aligned",
    c: "Plugs into your wellbeing strategy (B Corp, EIA, ESG reporting). Real impact on parents and carers.",
  },
];

const useCases = [
  {
    t: "Sick child, can't go to nursery",
    c: "Employee opens the app at 7am, has a vetted caregiver at home by 9am, makes their 10am meeting.",
  },
  {
    t: "Elderly parent, hospital discharge",
    c: "Subsidised post-discharge care for the parent of an employee, instead of forcing a week of unplanned leave.",
  },
  {
    t: "Special-needs school holiday",
    c: "Holiday cover for a child with autism — caregivers selected for declared experience and training.",
  },
  {
    t: "Maternity / paternity transition",
    c: "Postnatal support to ease the return-to-work transition — known to materially improve retention.",
  },
];

export default function Page() {
  return (
    <MarketingShell>
      <PageHeroBanner pageKey="audience.employers" height="md" tint="soft" />
      <section className="px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
              For employers &amp; HR
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
              Backup care that retains your workforce.
            </h1>
            <p className="mt-6 text-lg text-slate-600 leading-relaxed">
              When childcare falls through, an employee&rsquo;s day is gone.
              When eldercare falls through, weeks are gone. SpecialCarer for
              Employers turns those gaps into a single, instant booking — at
              your subsidy level.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/employers/contact"
                className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition text-center"
              >
                Talk to our team
              </Link>
              <Link
                href="#how"
                className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition text-center"
              >
                How it works
              </Link>
            </div>
          </div>
          <div className="bg-slate-900 text-white rounded-3xl p-8 lg:p-10 grid grid-cols-1 gap-6">
            {stats.map((s) => (
              <div key={s.v}>
                <div className="text-4xl font-semibold">{s.v}</div>
                <div className="mt-1 text-sm text-slate-300">{s.l}</div>
              </div>
            ))}
            <div className="text-xs text-slate-400 mt-2">
              Sources: ONS / Care Quality Commission / employer survey data.
              Provided as illustrative — your numbers will vary.
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="px-6 py-12 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            What you get
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.t}
                className="bg-white p-6 rounded-2xl border border-slate-100"
              >
                <h3 className="font-semibold text-slate-900">{f.t}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {f.c}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            What employees actually use it for
          </h2>
          <div className="mt-8 grid sm:grid-cols-2 gap-6">
            {useCases.map((u) => (
              <div
                key={u.t}
                className="bg-slate-50 p-6 rounded-2xl border border-slate-100"
              >
                <h3 className="font-semibold text-slate-900">{u.t}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {u.c}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Pricing &amp; pilot
          </h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            Plans start at £6 per employee per month for unlimited access (your
            employees still pay caregiver hourly rates, optionally subsidised
            by you). Pooled-credit plans available for organisations who prefer
            an annual budget and per-event caps. We&rsquo;re actively running
            pilots — get in touch for a tailored proposal.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/employers/contact"
              className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition text-center"
            >
              Request a pilot
            </Link>
            <a
              href="mailto:employers@specialcarer.com"
              className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition text-center"
            >
              employers@specialcarer.com
            </a>
          </div>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Compliance &amp; data
          </h2>
          <ul className="mt-4 text-sm text-slate-700 space-y-2">
            <li>• UK GDPR + EU GDPR + CCPA-aligned data handling</li>
            <li>• Postgres row-level security on all employee data</li>
            <li>
              • Data Processing Agreement available — we are the data controller
              for caregivers; joint controller arrangement available for
              employer-managed deployments
            </li>
            <li>• Quarterly anonymised usage reports</li>
            <li>
              • SOC2-style controls roadmap published — contact us for current
              status
            </li>
          </ul>
        </div>
      </section>
    </MarketingShell>
  );
}

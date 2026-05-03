import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export type ServicePageProps = {
  eyebrow: string;
  title: string;
  lede: string;
  bullets: string[];
  faqs: { q: string; a: string }[];
  certifications?: string[];
  notForEmergencies?: boolean;
};

export default function ServicePage({
  eyebrow,
  title,
  lede,
  bullets,
  faqs,
  certifications,
  notForEmergencies = true,
}: ServicePageProps) {
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-24 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          {eyebrow}
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed">{lede}</p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/find-care"
            className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-600 transition text-center"
          >
            Find a caregiver
          </Link>
          <Link
            href="/how-it-works"
            className="px-6 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-medium hover:bg-slate-50 transition text-center"
          >
            How it works
          </Link>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            What&rsquo;s included
          </h2>
          <ul className="mt-6 grid sm:grid-cols-2 gap-3 text-sm text-slate-700">
            {bullets.map((b) => (
              <li
                key={b}
                className="bg-white p-4 rounded-xl border border-slate-100 flex gap-3"
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
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {certifications && certifications.length > 0 && (
        <section className="px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold text-slate-900">
              Caregiver credentials we look for
            </h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {certifications.map((c) => (
                <span
                  key={c}
                  className="px-3 py-1 rounded-full bg-white border border-slate-200 text-sm text-slate-700"
                >
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Caregiver credentials are self-declared at sign-up and verified
              against background-check vendor data. Specific verification varies
              by jurisdiction.
            </p>
          </div>
        </section>
      )}

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Frequently asked
          </h2>
          <div className="mt-6 space-y-4">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="bg-white p-5 rounded-xl border border-slate-100 group"
              >
                <summary className="font-medium text-slate-900 cursor-pointer list-none flex justify-between gap-4">
                  {f.q}
                  <span className="text-slate-400 group-open:rotate-45 transition">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {notForEmergencies && (
        <section className="px-6 py-8">
          <div className="max-w-4xl mx-auto bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            <strong>SpecialCarer is not a medical or emergency service.</strong>{" "}
            For medical emergencies dial 999 (UK) or 911 (US). Caregivers do not
            administer prescription medication or provide skilled clinical care
            unless explicitly licensed and engaged for that purpose.
          </div>
        </section>
      )}

      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto bg-brand text-white rounded-2xl px-8 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Ready to find {eyebrow.toLowerCase()}?
          </h2>
          <Link
            href="/find-care"
            className="mt-6 inline-block px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-brand-50 transition"
          >
            Find a caregiver
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

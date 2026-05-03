import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "About SpecialCarer — All Care 4 U Group Limited",
  description:
    "SpecialCarer is a product of All Care 4 U Group Limited — building a marketplace for trusted, vetted caregivers across the UK and US.",
};

export default function Page() {
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-24 max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          About
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Care should be findable, fair, and safe.
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed">
          SpecialCarer is being built by people who&rsquo;ve been on both sides
          of the care relationship — as families looking for help, and as
          carers who&rsquo;ve worked through agencies that took too much and
          gave too little. We think there&rsquo;s a better way.
        </p>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            What we&rsquo;re building
          </h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            A two-sided marketplace where families can find vetted caregivers
            quickly, and where caregivers keep more of what they earn.
            Background checks, insurance, payments, and live shift tracking
            are built into the platform — not bolted on at extra cost.
          </p>

          <h2 className="mt-10 text-2xl font-semibold text-slate-900">
            What we believe
          </h2>
          <ul className="mt-3 space-y-3 text-slate-700">
            <li>
              <strong className="text-slate-900">
                Care work is real work.
              </strong>{" "}
              80% of every shift goes to the caregiver. Not 50%. Not 60%. 80%.
            </li>
            <li>
              <strong className="text-slate-900">
                Safety isn&rsquo;t optional.
              </strong>{" "}
              Every caregiver is identity-verified and background-checked.
              Every shift is tracked in real time.
            </li>
            <li>
              <strong className="text-slate-900">Transparency wins.</strong>{" "}
              We tell families what we do, what we don&rsquo;t do, and where
              the limits are.
            </li>
            <li>
              <strong className="text-slate-900">
                The UK and the US are not the same.
              </strong>{" "}
              We&rsquo;ve built for both from day one — different
              background-check vendors, different payment rails, different
              regulatory frameworks.
            </li>
          </ul>
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            The company behind SpecialCarer
          </h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            SpecialCarer is a product of{" "}
            <strong className="text-slate-900">
              All Care 4 U Group Limited
            </strong>
            , a UK company incorporated on 9 February 2015, registered in
            England &amp; Wales (company number 09428739). The registered
            office is 85 Great Portland Street, London, England, W1W 7LT.
          </p>
          <p className="mt-3 text-slate-600 leading-relaxed">
            All Care 4 U Group has been operating in the UK care sector for
            over a decade. SpecialCarer is the technology platform we&rsquo;re
            building to scale that experience to more families across the UK
            and US.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">Press</h2>
          <p className="mt-3 text-slate-600">
            For press, partnerships, or interviews, please contact{" "}
            <a
              href="mailto:press@specialcarer.com"
              className="text-brand-700 hover:underline"
            >
              press@specialcarer.com
            </a>
            .
          </p>

          <h2 className="mt-10 text-2xl font-semibold text-slate-900">
            Careers
          </h2>
          <p className="mt-3 text-slate-600">
            We&rsquo;re a small, fast-moving team. If you care about care, get
            in touch:{" "}
            <a
              href="mailto:careers@specialcarer.com"
              className="text-brand-700 hover:underline"
            >
              careers@specialcarer.com
            </a>
            .
          </p>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto bg-brand text-white rounded-2xl px-8 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold">
            Want to be part of it?
          </h2>
          <p className="mt-3 text-brand-50">
            Whether you&rsquo;re a family, a caregiver, or an employer — start
            here.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/find-care"
              className="px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-brand-50 transition"
            >
              Find care
            </Link>
            <Link
              href="/become-a-caregiver"
              className="px-6 py-3 rounded-xl bg-brand-700 text-white font-semibold hover:bg-brand-800 transition"
            >
              Apply to caregive
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

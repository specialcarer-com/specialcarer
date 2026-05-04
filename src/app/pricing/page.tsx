import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Pricing — SpecialCarer",
  description:
    "Transparent pricing. Caregivers set their own rates and keep 70%. SpecialCarer adds a 30% service fee covering verification, insurance, support, and payments.",
};

const tiers = [
  {
    name: "Family — pay-as-you-go",
    price: "Free to use",
    description:
      "Browse, message, and book caregivers with no monthly fees. Pay per booking with our 30% service fee built into the displayed hourly rate.",
    bullets: [
      "Free profile and search",
      "Caregivers' displayed rate is the all-in cost (rate + 30% service fee shown clearly)",
      "Escrow payments — released 24h after shift completes",
      "24/7 trust & safety support",
      "Live shift tracking",
      "Standard email support",
    ],
    cta: { label: "Find care", href: "/find-care" },
    highlight: false,
  },
  {
    name: "Caregiver",
    price: "Free to apply",
    description:
      "No subscription, no listing fees. We deduct 30% from each shift to fund verification, insurance, payments, and support.",
    bullets: [
      "Keep 70% of every shift",
      "Background check paid by SpecialCarer",
      "Same-day payouts via Stripe (when bank supports)",
      "Free training resources",
      "Top-rated programme for higher visibility",
    ],
    cta: { label: "Apply", href: "/become-a-caregiver" },
    highlight: false,
  },
];

export default function Page() {
  return (
    <MarketingShell>
      <section className="px-6 py-16 sm:py-24 max-w-4xl mx-auto text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
          Pricing
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900">
          Honest pricing. No surprise fees.
        </h1>
        <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          Caregivers set their own hourly rate. Our 30% service fee — which
          covers verification, insurance, payments, and support — is built into
          the price you see when you book. No subscriptions for families. No
          listing fees for caregivers.
        </p>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-6">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`bg-white rounded-2xl p-8 border ${
                t.highlight
                  ? "border-brand shadow-lg"
                  : "border-slate-100"
              }`}
            >
              {t.highlight && (
                <span className="inline-block px-3 py-1 rounded-full bg-brand text-white text-xs font-medium mb-3">
                  Coming soon
                </span>
              )}
              <h2 className="text-xl font-semibold text-slate-900">{t.name}</h2>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {t.price}
              </div>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                {t.description}
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
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
              <Link
                href={t.cta.href}
                className={`mt-6 block text-center px-5 py-3 rounded-xl font-medium transition ${
                  t.highlight
                    ? "bg-brand text-white hover:bg-brand-600"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {t.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            Worked example
          </h2>
          <div className="mt-6 bg-slate-50 rounded-2xl p-8 border border-slate-100">
            <p className="text-slate-700">
              Sarah books a caregiver in London for a 4-hour evening shift. The
              caregiver&rsquo;s rate is £18/hour.
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-x-12 gap-y-3 text-sm">
              <div className="text-slate-600">Caregiver rate (4 × £18)</div>
              <div className="text-slate-900 sm:text-right">£72.00</div>
              <div className="text-slate-600">SpecialCarer service fee (30%)</div>
              <div className="text-slate-900 sm:text-right">£21.60</div>
              <div className="text-slate-900 font-semibold border-t border-slate-200 pt-3">
                Sarah pays
              </div>
              <div className="text-slate-900 font-semibold sm:text-right border-t border-slate-200 pt-3">
                £93.60
              </div>
              <div className="text-slate-600 mt-3">Caregiver receives</div>
              <div className="text-slate-900 sm:text-right mt-3">£72.00</div>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Caregivers on SpecialCarer are independent contractors responsible
            for their own taxes (UK self-assessment / US 1099). Service fee may
            be adjusted by 1–2% to cover Stripe processing in some regions —
            always shown clearly at checkout.
          </p>
        </div>
      </section>

      <section className="px-6 py-12 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-semibold text-slate-900">
            For employers
          </h2>
          <p className="mt-3 text-slate-600">
            Offering backup care as an employee benefit? Per-employee
            subscriptions and pooled-credit plans available — see{" "}
            <Link href="/employers" className="text-brand-700 hover:underline">
              For employers
            </Link>{" "}
            for details.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}

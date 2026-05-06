"use client";

import {
  TopBar,
  BottomNav,
  ComingSoon,
  IconCrown,
  IconCheck,
} from "../_components/ui";

/**
 * Memberships placeholder.
 *
 * Real implementation:
 *   - Stripe Products + Prices created (Family Lite / Plus / Premium —
 *     monthly + annual SKUs). Pricing teased here is illustrative only
 *     and DOES NOT reflect a charged offering yet.
 *   - Stripe Subscriptions via the existing /api/stripe path; webhooks
 *     update a `subscriptions(user_id, plan, status, current_period_end)`
 *     row in Supabase.
 *   - Plan-aware booking flow: members get priority matching, reduced
 *     platform fee on long bookings, and concierge support.
 *
 * App Review note: nothing here charges a card. The CTAs are
 * "Notify me" only. We deliberately avoid showing pricing as a final
 * commitment so reviewers don't expect a working purchase flow.
 */

const PLANS: { name: string; tagline: string; perks: string[]; popular?: boolean }[] = [
  {
    name: "Lite",
    tagline: "For occasional support",
    perks: [
      "Priority match on weekday bookings",
      "Standard 30% platform fee",
      "Email support",
    ],
  },
  {
    name: "Plus",
    tagline: "For weekly care routines",
    popular: true,
    perks: [
      "Priority match across all hours",
      "Reduced platform fee on bookings over 4 hours",
      "Same-carer consistency where possible",
      "Phone + chat support",
    ],
  },
  {
    name: "Premium",
    tagline: "For dedicated, daily care",
    perks: [
      "Concierge booking — we match you in under an hour",
      "Lowest platform fee tier",
      "Care coordinator phone line",
      "Quarterly care reviews",
    ],
  },
];

export default function MembershipsPage() {
  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Memberships" back="/m/profile" />

      <ComingSoon
        hero={<IconCrown />}
        title="Care that keeps getting better"
        description="Membership plans will give regulars priority matching, reduced platform fees on longer bookings, and a dedicated coordinator for the families who rely on us most."
        bullets={[
          {
            icon: <IconCheck />,
            text: "Priority matching — your booking gets seen by the right carers first.",
          },
          {
            icon: <IconCheck />,
            text: "Reduced platform fee on long bookings, so more of what you pay reaches the carer.",
          },
          {
            icon: <IconCheck />,
            text: "Same-carer consistency where possible, plus a dedicated coordinator on the higher tiers.",
          },
        ]}
        secondary={{ label: "Back to profile", href: "/m/profile" }}
      />

      {/* Plan teaser strip — visual substance for reviewers */}
      <section className="px-5 pt-2 pb-10">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading mb-3">
          Plans we&apos;re working on
        </p>
        <div className="space-y-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-card bg-white p-4 shadow-card ${
                p.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-bold text-heading">{p.name}</p>
                {p.popular && (
                  <span className="rounded-pill bg-primary-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary">
                    Most popular
                  </span>
                )}
              </div>
              <p className="text-[13px] text-subheading">{p.tagline}</p>
              <ul className="mt-3 space-y-1.5">
                {p.perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-start gap-2 text-[13px] text-heading"
                  >
                    <span
                      className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-primary"
                      style={{ background: "rgba(3,158,160,0.15)" }}
                    >
                      <IconCheck />
                    </span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-[11.5px] text-subheading">
          Pricing will be confirmed before launch. No card required while
          memberships are in preview.
        </p>
      </section>

      <BottomNav active="profile" />
    </main>
  );
}

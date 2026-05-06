"use client";

import {
  ComingSoon,
  Card,
  Tag,
  IconCrown,
  IconCheck,
} from "../_components/ui";
import type { ActiveMembership } from "@/lib/memberships/types";
import { PLANS, PLAN_LABEL } from "@/lib/memberships/types";

function formatPeriodEnd(iso: string | null): string {
  if (!iso) return "ongoing";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "ongoing";
  }
}

function ActiveMembershipCard({ membership }: { membership: ActiveMembership }) {
  const plan = PLANS.find((p) => p.id === membership.plan);
  const isComp = membership.source === "comp";
  const periodLabel =
    membership.status === "comp"
      ? membership.currentPeriodEnd
        ? `Comp valid until ${formatPeriodEnd(membership.currentPeriodEnd)}`
        : "Comp \u2014 indefinite"
      : membership.cancelAtPeriodEnd
        ? `Cancels on ${formatPeriodEnd(membership.currentPeriodEnd)}`
        : `Renews on ${formatPeriodEnd(membership.currentPeriodEnd)}`;

  return (
    <section className="px-5 pt-5 pb-3">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-full text-primary"
            style={{ background: "rgba(3,158,160,0.15)" }}
            aria-hidden
          >
            <IconCrown />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
              Your membership
            </p>
            <p className="text-[18px] font-bold text-heading">
              {PLAN_LABEL[membership.plan]}
              {membership.billingInterval ? (
                <span className="text-[13px] font-normal text-subheading">
                  {" \u00b7 "}
                  {membership.billingInterval === "year" ? "Annual" : "Monthly"}
                </span>
              ) : null}
            </p>
          </div>
          {isComp ? (
            <Tag tone="amber">Comp</Tag>
          ) : membership.status === "trialing" ? (
            <Tag tone="primary">Trial</Tag>
          ) : membership.status === "past_due" ? (
            <Tag tone="red">Past due</Tag>
          ) : (
            <Tag tone="green">Active</Tag>
          )}
        </div>

        <p className="mt-3 text-[13px] text-subheading">{periodLabel}</p>

        {plan ? (
          <ul className="mt-4 space-y-2">
            {plan.perks.map((perk) => (
              <li
                key={perk}
                className="flex items-start gap-2 text-[13.5px] text-heading"
              >
                <span
                  className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full text-primary"
                  style={{ background: "rgba(3,158,160,0.15)" }}
                  aria-hidden
                >
                  <IconCheck />
                </span>
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {isComp ? (
          <p className="mt-4 rounded-card bg-primary-50 px-3 py-2 text-[12px] text-primary">
            This membership was given to you by SpecialCarer. Thank you for
            being part of our early community.
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function NonMemberShell() {
  return (
    <>
      <ComingSoon
        hero={<IconCrown />}
        title="Care that keeps getting better"
        description="Membership plans give regulars priority matching, reduced platform fees on longer bookings, and a dedicated coordinator for the families who rely on us most."
        bullets={[
          {
            icon: <IconCheck />,
            text: "Priority matching \u2014 your booking gets seen by the right carers first.",
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

      <section className="px-5 pt-2 pb-10">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-subheading">
          Plans we&apos;re working on
        </p>
        <div className="space-y-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`rounded-card bg-white p-4 shadow-card ${
                p.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-bold text-heading">{p.name}</p>
                {p.popular ? (
                  <span className="rounded-pill bg-primary-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary">
                    Most popular
                  </span>
                ) : null}
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
                      aria-hidden
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
    </>
  );
}

export default function MembershipsClient({
  membership,
}: {
  membership: ActiveMembership | null;
}) {
  if (membership) {
    return <ActiveMembershipCard membership={membership} />;
  }
  return <NonMemberShell />;
}

"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Tag,
  IconCrown,
  IconCheck,
} from "../_components/ui";
import type { ActiveMembership, MembershipPlan } from "@/lib/memberships/types";
import { PLANS, PLAN_LABEL } from "@/lib/memberships/types";

/**
 * Kick off Stripe Checkout for a plan: POST to the checkout route, then
 * redirect the browser to the returned hosted Checkout url.
 *
 * App Review / iOS note: on the web target (what Apple reviewers see on the
 * marketing site) this navigates inline via window.location. Inside the
 * native iOS Capacitor/Expo shell the checkout url should be intercepted and
 * opened in the system browser (Capacitor Browser.open /
 * WebBrowser.openAuthSessionAsync) instead of the in-app WebView, so the
 * Stripe-hosted page renders in Safari and returns to /m/memberships via the
 * success_url. That interception lives in the shell, not here.
 */
async function startCheckout(planSlug: MembershipPlan): Promise<string> {
  const res = await fetch("/api/memberships/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan_slug: planSlug }),
  });
  const json = (await res.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;
  if (!res.ok || !json?.url) {
    throw new Error(
      json?.error ?? "Could not start checkout. Please try again."
    );
  }
  return json.url;
}

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
            This membership was given to you by SpecialCarers. Thank you for
            being part of our early community.
          </p>
        ) : null}
      </Card>
    </section>
  );
}

function PlanCard({ plan }: { plan: (typeof PLANS)[number] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubscribe() {
    setBusy(true);
    setError(null);
    try {
      const url = await startCheckout(plan.id);
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-card bg-white p-4 shadow-card ${
        plan.popular ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="text-[16px] font-bold text-heading">{plan.name}</p>
        {plan.popular ? (
          <span className="rounded-pill bg-primary-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary">
            Most popular
          </span>
        ) : null}
      </div>
      <p className="text-[13px] text-subheading">{plan.tagline}</p>
      <ul className="mt-3 space-y-1.5">
        {plan.perks.map((perk) => (
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

      <Button
        variant={plan.popular ? "primary" : "ghost"}
        size="md"
        block
        className="mt-4"
        disabled={busy}
        onClick={onSubscribe}
      >
        {busy ? "Opening checkout\u2026" : `Subscribe to ${plan.name}`}
      </Button>

      {error ? (
        <p className="mt-2 text-center text-[12px] text-[#C22]">{error}</p>
      ) : null}
    </div>
  );
}

function NonMemberShell() {
  return (
    <>
      <section className="px-5 pt-6 pb-2 text-center">
        <span
          className="mx-auto grid h-14 w-14 place-items-center rounded-full text-primary"
          style={{ background: "rgba(3,158,160,0.15)" }}
          aria-hidden
        >
          <IconCrown />
        </span>
        <h1 className="mt-3 text-[22px] font-bold text-heading">
          Care that keeps getting better
        </h1>
        <p className="mt-2 text-[14px] text-subheading">
          Membership plans give regulars priority matching, reduced platform
          fees on longer bookings, and a dedicated coordinator for the families
          who rely on us most.
        </p>
      </section>

      <section className="px-5 pt-4 pb-10">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-subheading">
          Choose a plan
        </p>
        <div className="space-y-3">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
        <p className="mt-4 text-center text-[11.5px] text-subheading">
          Billed securely via Stripe. Cancel anytime from your account. Prices
          shown at checkout.
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

"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Tag,
  IconCrown,
  IconCheck,
} from "../../_components/ui";
import {
  CARER_FOUNDER_PERKS,
  CARER_FOUNDER_PRICE_LABEL,
  isCarerMembershipActive,
  type CarerMembership,
} from "@/lib/carer-membership/constants";

async function postForUrl(path: string): Promise<string> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const json = (await res.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? "Something went wrong. Please try again.");
  }
  return json.url;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function PerksList() {
  return (
    <ul className="mt-4 space-y-2">
      {CARER_FOUNDER_PERKS.map((perk) => (
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
  );
}

function StartCheckoutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart() {
    setBusy(true);
    setError(null);
    try {
      const url = await postForUrl("/api/billing/carer-checkout");
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size="lg"
        block
        className="mt-5"
        disabled={busy}
        onClick={onStart}
      >
        {busy ? "Opening checkout…" : label}
      </Button>
      {error ? (
        <p className="mt-2 text-center text-[12px] text-[#C22]">{error}</p>
      ) : null}
    </>
  );
}

function ManageInStripeButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onManage() {
    setBusy(true);
    setError(null);
    try {
      const url = await postForUrl("/api/billing/carer-portal");
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="md"
        block
        className="mt-5"
        disabled={busy}
        onClick={onManage}
      >
        {busy ? "Opening…" : "Manage in Stripe"}
      </Button>
      {error ? (
        <p className="mt-2 text-center text-[12px] text-[#C22]">{error}</p>
      ) : null}
    </>
  );
}

function HeroIcon() {
  return (
    <span
      className="mx-auto grid h-14 w-14 place-items-center rounded-full text-primary"
      style={{ background: "rgba(3,158,160,0.15)" }}
      aria-hidden
    >
      <IconCrown />
    </span>
  );
}

/** State 1: no membership row at all. */
function NonMemberShell() {
  return (
    <section className="px-5 pt-6 pb-10">
      <div className="text-center">
        <HeroIcon />
        <h1 className="mt-3 text-[22px] font-bold text-heading">
          Become a Founding Carer
        </h1>
        <p className="mt-2 text-[14px] text-subheading">
          Join for {CARER_FOUNDER_PRICE_LABEL}/month and publish your profile to
          families across the UK.
        </p>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex items-baseline gap-1">
          <span className="text-[28px] font-bold text-heading">
            {CARER_FOUNDER_PRICE_LABEL}
          </span>
          <span className="text-[14px] text-subheading">/ month</span>
        </div>
        <PerksList />
        <StartCheckoutButton label="Start membership" />
        <p className="mt-3 text-center text-[11.5px] text-subheading">
          Billed securely via Stripe. Cancel anytime.
        </p>
      </Card>
    </section>
  );
}

/** State 2: active member. */
function ActiveShell({ membership }: { membership: CarerMembership }) {
  return (
    <section className="px-5 pt-5 pb-10">
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
              Founding Carer
            </p>
          </div>
          <Tag tone="green">Active</Tag>
        </div>

        <p className="mt-3 text-[13px] text-subheading">
          Renews on {formatDate(membership.currentPeriodEnd)}
        </p>

        <PerksList />
        <ManageInStripeButton />
      </Card>
    </section>
  );
}

/** State 3: past due / canceled (a row exists but entitlement lapsed). */
function LapsedShell({ membership }: { membership: CarerMembership }) {
  const pastDue = membership.status === "past_due";
  return (
    <section className="px-5 pt-5 pb-10">
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
              Founding Carer
            </p>
          </div>
          <Tag tone={pastDue ? "amber" : "red"}>
            {pastDue ? "Past due" : "Canceled"}
          </Tag>
        </div>

        <p className="mt-3 text-[13px] text-subheading">
          {pastDue
            ? "Your last payment didn't go through, so your profile is no longer publishable. Update your payment details to restore it."
            : "Your membership has ended and your profile can no longer be published. Re-subscribe to go live again — your founder rate still applies."}
        </p>

        <PerksList />

        {pastDue ? <ManageInStripeButton /> : null}
        <StartCheckoutButton
          label={pastDue ? "Re-subscribe" : "Re-subscribe"}
        />
      </Card>
    </section>
  );
}

export default function CarerMembershipClient({
  membership,
}: {
  membership: CarerMembership | null;
}) {
  if (!membership) {
    return <NonMemberShell />;
  }
  if (isCarerMembershipActive(membership.status, membership.currentPeriodEnd)) {
    return <ActiveShell membership={membership} />;
  }
  return <LapsedShell membership={membership} />;
}

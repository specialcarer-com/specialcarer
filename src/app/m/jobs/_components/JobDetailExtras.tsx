"use client";

/**
 * Shared "pre-acceptance" extras for the carer-side job detail.
 * Lazy-fetches /api/m/jobs/[id]/details and renders three blocks:
 *   • About this client (rating + completed bookings + repeat pill)
 *   • Care recipients (sanitised — no name / DOB / address)
 *   • Pay breakdown (hours × rate, − carer fee, take-home)
 *
 * Both /m/jobs/[id] (targeted booking) and /m/jobs/open/[id] (open
 * request) render this component, so the carer sees consistent
 * pre-acceptance signal regardless of how the job surfaced.
 */

import { useEffect, useState } from "react";
import { Avatar, Card, Tag } from "../../_components/ui";

type Aggregate = {
  rating_avg: number | null;
  rating_count: number;
  completed_bookings: number;
  last_completed_at: string | null;
};

type SeekerSummary = {
  first_name: string;
  initial: string;
  aggregate: Aggregate;
  is_repeat: boolean;
};

type SanitizedRecipient = {
  id: string;
  kind: "child" | "senior" | "home";
  label: string;
  tags: string[];
};

type PayBreakdown = {
  hours: number;
  hourly_rate_cents: number;
  subtotal_cents: number;
  carer_fee_cents: number;
  carer_fee_percent: number;
  earnings_cents: number;
  currency: string;
  tax_country: "GB" | "US";
};

type DetailsResponse = {
  details:
    | {
        kind: "targeted";
        booking: {
          full_address_revealed: boolean;
        };
        recipients: SanitizedRecipient[];
        recipient_access_instructions: string | null;
        pay_breakdown: PayBreakdown;
        seeker: SeekerSummary;
      }
    | {
        kind: "open";
        pay_breakdown: PayBreakdown;
        seeker: SeekerSummary;
      };
};

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

const TAX_LINK: Record<"GB" | "US", { label: string; href: string }> = {
  GB: {
    label: "gov.uk: self-employed tax",
    href: "https://www.gov.uk/working-for-yourself",
  },
  US: {
    label: "IRS: 1099 contractor tax",
    href: "https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee",
  },
};

export default function JobDetailExtras({
  jobId,
  kind,
  /**
   * When true (targeted booking accepted/paid/etc.) the recipient
   * block also shows access instructions. The component still
   * receives them only when the API has decided to reveal — this is a
   * fallback flag for clarity in the UI.
   */
}: {
  jobId: string;
  kind: "targeted" | "open";
}) {
  const [data, setData] = useState<DetailsResponse["details"] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/m/jobs/${jobId}/details?kind=${kind}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setErr(j.error ?? "Couldn't load details.");
          return;
        }
        const json = (await res.json()) as DetailsResponse;
        if (!cancelled) setData(json.details);
      } catch {
        if (!cancelled) setErr("Network error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, kind]);

  if (err) {
    return (
      <Card className="p-4">
        <p className="text-[12px] text-rose-700">{err}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="p-4">
        <p className="text-[12px] text-subheading">Loading client details…</p>
      </Card>
    );
  }

  const seeker = data.seeker;
  const isTargeted = data.kind === "targeted";

  return (
    <>
      {/* About this client */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={seeker.initial} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-bold text-heading truncate">
                {seeker.first_name}
              </p>
              {seeker.is_repeat && <Tag tone="green">✨ Repeat client</Tag>}
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              {seeker.aggregate.rating_count > 0 &&
              seeker.aggregate.rating_avg != null ? (
                <span className="text-[13px] text-heading">
                  ★ {Number(seeker.aggregate.rating_avg).toFixed(1)}{" "}
                  <span className="text-subheading text-[12px]">
                    ({seeker.aggregate.rating_count} rating
                    {seeker.aggregate.rating_count === 1 ? "" : "s"})
                  </span>
                </span>
              ) : (
                <Tag tone="amber">New client</Tag>
              )}
              <span className="text-[12px] text-subheading">
                Past bookings:{" "}
                <strong className="text-heading">
                  {seeker.aggregate.completed_bookings}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Care recipients (targeted only — open requests don't link recipients) */}
      {isTargeted && data.recipients.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
            Care recipients
          </p>
          <ul className="space-y-2">
            {data.recipients.map((r) => (
              <li
                key={r.id}
                className="rounded-card border border-line p-3 bg-white"
              >
                <p className="text-[14px] font-semibold text-heading">
                  {r.label}
                </p>
                {r.tags.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {r.tags.map((t, i) => (
                      <li key={i} className="text-[12px] text-subheading">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {!data.booking.full_address_revealed && (
            <p className="mt-2 text-[11px] text-subheading">
              Names, ages of birth, addresses and medications are revealed
              only after you accept.
            </p>
          )}
        </Card>
      )}

      {/* Special instructions (only when revealed) */}
      {isTargeted &&
        data.booking.full_address_revealed &&
        data.recipient_access_instructions && (
          <Card className="p-4">
            <p className="text-[12px] uppercase tracking-wide text-subheading mb-1">
              Access instructions
            </p>
            <p className="text-[13px] text-heading whitespace-pre-wrap">
              {data.recipient_access_instructions}
            </p>
          </Card>
        )}

      {/* Pay breakdown */}
      <PayCard breakdown={data.pay_breakdown} />
    </>
  );
}

function PayCard({ breakdown }: { breakdown: PayBreakdown }) {
  const tax = TAX_LINK[breakdown.tax_country];
  const sym = breakdown.currency.toUpperCase() === "USD" ? "$" : "£";
  return (
    <Card className="p-4">
      <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
        Pay breakdown
      </p>
      <table className="w-full text-[13px]">
        <tbody>
          <Row
            label="Hours"
            value={`${breakdown.hours.toFixed(
              breakdown.hours % 1 === 0 ? 0 : 2,
            )} hr`}
          />
          <Row
            label="Hourly rate"
            value={`${sym}${(breakdown.hourly_rate_cents / 100).toFixed(0)}/hr`}
          />
          <Row
            label="Subtotal"
            value={fmtMoney(breakdown.subtotal_cents, breakdown.currency)}
          />
          <Row
            label={`Platform fee (${breakdown.carer_fee_percent}%)`}
            value={`− ${fmtMoney(
              breakdown.carer_fee_cents,
              breakdown.currency,
            )}`}
            tone="muted"
          />
          <tr>
            <td colSpan={2} className="pt-2">
              <hr className="border-line" />
            </td>
          </tr>
          <Row
            label="Your earnings"
            value={fmtMoney(breakdown.earnings_cents, breakdown.currency)}
            highlighted
          />
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-subheading">
        Earnings are paid to your Stripe account 24h after the shift ends.
        You&rsquo;re responsible for your own tax —{" "}
        <a
          href={tax.href}
          target="_blank"
          rel="noreferrer"
          className="text-primary font-semibold underline"
        >
          {tax.label}
        </a>
        .
      </p>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
  highlighted,
}: {
  label: string;
  value: string;
  tone?: "muted";
  highlighted?: boolean;
}) {
  return (
    <tr>
      <td
        className={`py-1 pr-2 align-top ${
          tone === "muted" ? "text-subheading" : "text-heading"
        } ${highlighted ? "font-bold text-[14px]" : ""}`}
      >
        {label}
      </td>
      <td
        className={`py-1 text-right tabular-nums ${
          tone === "muted" ? "text-subheading" : "text-heading"
        } ${highlighted ? "font-bold text-[15px] text-primary" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

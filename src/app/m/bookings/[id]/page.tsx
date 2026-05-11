"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  IconCal,
  IconChatBubble,
  IconJournal,
  IconMail,
  IconPhone,
  IconPin,
  Tag,
  TopBar,
} from "../../_components/ui";
import {
  TimesheetReviewCard,
  type TimesheetRow,
  type PendingAdjustment,
} from "../../_components/TimesheetReviewCard";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import type { ApiBookingDetail } from "@/app/api/m/bookings/[id]/route";

/**
 * Booking detail — Figma layout preserved. Real data sourced from
 * /api/m/bookings/[id]. Shows the counterparty profile, schedule,
 * notes, contact actions, and a payment-status card when present.
 */

type Tone = "primary" | "amber" | "green" | "red" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  pending: "amber",
  accepted: "green",
  paid: "green",
  in_progress: "primary",
  completed: "primary",
  paid_out: "neutral",
  cancelled: "red",
  refunded: "neutral",
  disputed: "red",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Requested",
  accepted: "Accepted",
  paid: "Paid",
  in_progress: "In progress",
  completed: "Completed",
  paid_out: "Paid out",
  cancelled: "Cancelled",
  refunded: "Refunded",
  disputed: "Disputed",
};

function asCurrencyUpper(c: "gbp" | "usd"): "GBP" | "USD" {
  return c === "usd" ? "USD" : "GBP";
}

function fmtDateLong(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtTimeRange(startsIso: string, endsIso: string): string {
  if (!startsIso || !endsIso) return "—";
  const s = new Date(startsIso);
  const e = new Date(endsIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(s)}–${fmt(e)}`;
}

function counterpartyName(b: ApiBookingDetail): string {
  return (
    b.counterparty.display_name ??
    b.counterparty.full_name ??
    (b.as_role === "seeker" ? "Caregiver" : "Care seeker")
  );
}

function paymentLine(p: NonNullable<ApiBookingDetail["payment"]>): string {
  const amt = formatMoney(
    p.amount_cents,
    p.currency.toUpperCase() === "USD" ? "USD" : "GBP",
  );
  switch (p.status) {
    case "requires_capture":
    case "authorized":
      return `Payment authorised — ${amt} (capture on completion)`;
    case "succeeded":
    case "captured":
      return `Payment captured — ${amt}`;
    case "refunded":
      return `Refunded — ${amt}`;
    case "canceled":
    case "cancelled":
      return `Payment cancelled — ${amt}`;
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return `Awaiting payment — ${amt}`;
    case "processing":
      return `Processing payment — ${amt}`;
    default:
      return `Payment ${p.status} — ${amt}`;
  }
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [data, setData] = useState<ApiBookingDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [timesheet, setTimesheet] = useState<TimesheetRow | null>(null);
  const [pendingAdjustment, setPendingAdjustment] =
    useState<PendingAdjustment | null>(null);

  const refreshTimesheet = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/m/bookings/${id}/timesheet`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = (await res.json()) as {
        timesheet: TimesheetRow | null;
        pending_adjustment: PendingAdjustment | null;
      };
      setTimesheet(j.timesheet ?? null);
      setPendingAdjustment(j.pending_adjustment ?? null);
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/m/bookings/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setLoaded(true);
          return;
        }
        if (!res.ok) {
          setLoaded(true);
          return;
        }
        const json = (await res.json()) as ApiBookingDetail;
        if (!cancelled) {
          setData(json);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    // Fetch timesheet in parallel — pure best-effort, errors are ignored.
    void refreshTimesheet();
    return () => {
      cancelled = true;
    };
  }, [id, refreshTimesheet]);

  if (!loaded) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen pb-32">
        <TopBar back="/m/bookings" title="Booking details" />
        <div className="px-4 pt-4 space-y-3" aria-busy="true">
          <div className="h-24 rounded-card bg-muted animate-pulse" />
          <div className="h-32 rounded-card bg-muted animate-pulse" />
          <div className="h-24 rounded-card bg-muted animate-pulse" />
        </div>
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/bookings" title="Booking" />
        <div className="px-6 mt-10 text-center">
          <p className="text-heading font-semibold">Booking not found</p>
          <Link
            href="/m/bookings"
            className="mt-3 inline-block text-primary font-bold"
          >
            Back to bookings
          </Link>
        </div>
      </main>
    );
  }

  const name = counterpartyName(data);
  const avatar = data.counterparty.photo_url ?? data.counterparty.avatar_url ?? undefined;
  const tone = STATUS_TONE[data.status] ?? "neutral";
  const statusLabel = STATUS_LABEL[data.status] ?? data.status;
  const location = [
    data.location_city,
    data.location_country?.toUpperCase() === "GB"
      ? "UK"
      : data.location_country?.toUpperCase() === "US"
        ? "US"
        : data.location_country ?? null,
  ]
    .filter((s): s is string => Boolean(s))
    .join(", ");

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back="/m/bookings" title="Booking details" />

      <div className="px-4 pt-2 space-y-4">
        <Card>
          <div className="flex items-start gap-3">
            <Avatar src={avatar} name={name} size={56} />
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold text-heading">{name}</p>
              {data.counterparty.city && (
                <p className="text-[12px] text-subheading inline-flex items-center gap-1">
                  <IconPin /> {data.counterparty.city}
                </p>
              )}
            </div>
            <Tag tone={tone}>{statusLabel}</Tag>
          </div>

          {data.service_type && (
            <div className="mt-4">
              <Tag tone="primary">{serviceLabel(data.service_type)}</Tag>
            </div>
          )}
        </Card>

        {/* Timesheet review surface — visible once the carer has checked out. */}
        {timesheet && (
          <TimesheetReviewCard
            ts={timesheet}
            pendingAdjustment={pendingAdjustment}
            isOrgView={false}
            onChanged={refreshTimesheet}
          />
        )}

        {/* Payment status — visible only when a payment row exists. */}
        {data.payment && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-1">Payment</p>
            <p className="text-[13px] text-heading">
              {paymentLine(data.payment)}
            </p>
            <p className="mt-2 text-[11.5px] text-subheading leading-relaxed">
              You won&rsquo;t be charged until the shift is complete and the
              24-hour dispute window closes.
            </p>
          </Card>
        )}

        <Card>
          <p className="text-[14px] font-bold text-heading mb-3">Schedule</p>
          <ul className="space-y-2 text-[13px] text-heading">
            <li className="flex items-center gap-2">
              <span className="text-subheading">
                <IconCal />
              </span>
              {fmtDateLong(data.starts_at)}
            </li>
            {data.starts_at && data.ends_at && (
              <li className="flex items-center gap-2">
                <span className="text-subheading">
                  <IconCal />
                </span>
                {fmtTimeRange(data.starts_at, data.ends_at)}
                {data.hours > 0 && (
                  <span className="text-subheading"> · {data.hours} hrs</span>
                )}
              </li>
            )}
            {location && (
              <li className="flex items-center gap-2">
                <span className="text-subheading">
                  <IconPin />
                </span>
                {location}
              </li>
            )}
            {data.total_cents > 0 && (
              <li className="flex items-center gap-2 text-subheading">
                Total:{" "}
                <span className="font-bold text-heading">
                  {formatMoney(data.total_cents, asCurrencyUpper(data.currency))}
                </span>
              </li>
            )}
          </ul>
        </Card>

        {data.notes && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-2">Notes</p>
            <p className="text-[13px] text-subheading leading-relaxed whitespace-pre-line">
              {data.notes}
            </p>
          </Card>
        )}

        <Card>
          <p className="text-[14px] font-bold text-heading mb-3">Contact</p>
          <div className="grid grid-cols-3 gap-2">
            <ContactBtn icon={<IconPhone />} label="Call" />
            <ContactBtn icon={<IconMail />} label="Email" />
            <ContactBtn
              icon={<IconChatBubble />}
              label="Message"
              href={`/m/chat/${data.counterparty.user_id}`}
            />
          </div>
        </Card>

        {/* Care journal — entries appear on /m/journal. */}
        <Card>
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 flex-none place-items-center rounded-full"
              style={{ background: "rgba(3,158,160,0.10)", color: "#039EA0" }}
              aria-hidden
            >
              <IconJournal />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-heading">Care journal</p>
              <p className="text-[12px] text-subheading mt-0.5">
                Short notes, photos and mood updates from this visit.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/m/journal/new" className="flex-1">
                  <Button size="sm" block>
                    Add a note
                  </Button>
                </Link>
                <Link href="/m/journal" className="flex-1">
                  <Button size="sm" variant="outline" block>
                    View journal
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom space-y-2">
        {(data.status === "accepted" || data.status === "paid" ||
          data.status === "in_progress") && (
          // Live tracking only makes sense once the carer has accepted.
          <Link href={`/m/track/${data.id}`}>
            <Button block>Track carer</Button>
          </Link>
        )}
        {data.status === "pending" || data.status === "accepted" ||
        data.status === "paid" ? (
          <Button
            block
            variant="danger"
            onClick={() => {
              // TODO: wire to /api/bookings/[id]/action with action=cancel.
              // Mock for now — keep the button visible so QA can sanity-check the layout.
              console.log("Cancel requested for booking", data.id);
            }}
          >
            Cancel booking
          </Button>
        ) : data.status === "completed" ? (
          <Link href={`/m/carer/${data.counterparty.user_id}`}>
            <Button block>Book again</Button>
          </Link>
        ) : (
          <Link href="/m/home">
            <Button block>Find another caregiver</Button>
          </Link>
        )}
      </div>
    </main>
  );
}

function ContactBtn({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-1.5 py-3 rounded-btn bg-primary-50 text-primary">
      {icon}
      <span className="text-[12px] font-bold">{label}</span>
    </div>
  );
  return href ? (
    <Link href={href}>{inner}</Link>
  ) : (
    <button className="w-full">{inner}</button>
  );
}

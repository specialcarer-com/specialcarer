"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  IconCal,
  IconCard,
  IconCheck,
  IconLock,
  IconPin,
  TopBar,
} from "../../../_components/ui";
import {
  CARE_FORMAT_LABEL,
  type CareFormat,
  SERVICE_LABEL,
  getCarer,
} from "../../../_lib/mock";

/**
 * Booking Checkout — payment summary + Stripe (real) handoff.
 *
 * v1 path (mock carers): authorisation simulated, success screen shown.
 * Real path (when caregivers are seeded in Supabase): calls
 *   POST /api/stripe/create-booking-intent
 * to mint a PaymentIntent and confirms via Apple Pay / card sheet.
 */

function CheckoutInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const carer = getCarer(params.id);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!carer) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back={`/m/book/${params.id}`} title="Checkout" />
        <p className="px-6 mt-10 text-center text-heading">Carer not found.</p>
      </main>
    );
  }

  const careType: CareFormat =
    (sp.get("careType") as CareFormat) === "live_in" ? "live_in" : "visiting";
  const service = sp.get("service") || carer.services[0];
  const dateRaw = sp.get("date");
  const endDateRaw = sp.get("endDate");
  const slot = sp.get("slot") || "—";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const address = sp.get("address") || "";

  const date = dateRaw ? new Date(dateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const fmtLong = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const dateStr = date ? fmtLong(date) : "—";
  const endDateStr = endDate ? fmtLong(endDate) : "—";

  // Visiting — duration from from/to (HH:MM strings); fall back to 2h.
  let hours = 2;
  if (from && to) {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    if (
      Number.isFinite(fh) &&
      Number.isFinite(fm) &&
      Number.isFinite(th) &&
      Number.isFinite(tm)
    ) {
      hours = Math.max(0.5, ((th * 60 + tm) - (fh * 60 + fm)) / 60);
    }
  }

  // Live-in — number of weeks (rounded up), capped at 1 week min.
  let weeks = 1;
  if (careType === "live_in" && date && endDate) {
    const days = Math.ceil(
      (endDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    weeks = Math.max(1, Math.ceil(days / 7));
  }

  // Pricing branch — visiting bills hourly, live-in bills weekly.
  // Live-in carers without a `weekly` rate fall back to hourly × 50.
  const weeklyUsd =
    carer.weekly?.usd ?? Math.round(carer.hourly.usd * 50);
  const subtotal =
    careType === "live_in" ? weeklyUsd * weeks : carer.hourly.usd * hours;
  const platformFee = +(subtotal * 0.05).toFixed(2);
  const total = +(subtotal + platformFee).toFixed(2);

  const onPay = async () => {
    setBusy(true);
    setError(null);
    try {
      // v1: mock authorisation. Real PaymentIntent flow lands once
      // carers exist as Supabase rows (real UUIDs + Stripe Connect ids).
      await new Promise((r) => setTimeout(r, 1100));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-[100dvh] bg-white grid place-items-center px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto w-20 h-20 grid place-items-center rounded-full bg-primary text-white">
            <IconCheck />
          </div>
          <h1 className="mt-5 text-[24px] font-bold text-heading">
            Booking requested
          </h1>
          <p className="mt-2 text-subheading text-[14px] leading-relaxed">
            We&apos;ve sent your request to {carer.name}. They have 24 hours to
            accept — you won&apos;t be charged until they confirm.
          </p>
          <div className="mt-8 grid gap-3">
            <Link href="/m/bookings">
              <Button block>View my bookings</Button>
            </Link>
            <Link
              href="/m/home"
              className="text-primary font-bold text-[14px] py-2"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back={`/m/book/${carer.id}`} title="Checkout" />

      <div className="px-4 pt-2 space-y-4">
        {/* Carer summary */}
        <Card>
          <div className="flex items-center gap-3">
            <Avatar src={carer.photo} name={carer.name} size={56} />
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold text-heading">{carer.name}</p>
              <p className="text-[12px] text-subheading">
                {SERVICE_LABEL[service as keyof typeof SERVICE_LABEL] || service}
              </p>
            </div>
          </div>
        </Card>

        {/* Booking details */}
        <Card>
          <p className="text-[14px] font-bold text-heading mb-3">
            Booking details
          </p>
          <ul className="space-y-2 text-[13px] text-heading">
            <li className="flex items-center gap-2">
              <span className="text-subheading">•</span>
              <span className="font-semibold">{CARE_FORMAT_LABEL[careType]}</span>
            </li>
            {careType === "live_in" ? (
              <li className="flex items-center gap-2">
                <span className="text-subheading"><IconCal /></span>
                {dateStr} → {endDateStr}
              </li>
            ) : (
              <>
                <li className="flex items-center gap-2">
                  <span className="text-subheading"><IconCal /></span>
                  {dateStr}
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-subheading"><IconCal /></span>
                  {slot}
                  {from && to ? ` · ${from}–${to}` : ""}
                </li>
              </>
            )}
            <li className="flex items-center gap-2">
              <span className="text-subheading"><IconPin /></span>
              {address || "Address not set"}
            </li>
          </ul>
        </Card>

        {/* Price breakdown */}
        <Card>
          <p className="text-[14px] font-bold text-heading mb-3">Price</p>
          <div className="space-y-2 text-[13px]">
            <Row
              label={
                careType === "live_in"
                  ? `$${weeklyUsd}/week × ${weeks} week${weeks === 1 ? "" : "s"}`
                  : `$${carer.hourly.usd}/hr × ${hours.toFixed(1)} hrs`
              }
              value={`$${subtotal.toFixed(2)}`}
            />
            <Row
              label="Platform fee"
              value={`$${platformFee.toFixed(2)}`}
            />
            <div className="h-px bg-line my-2" />
            <Row
              label={<span className="font-bold text-heading">Total</span>}
              value={
                <span className="font-bold text-heading text-[16px]">
                  ${total.toFixed(2)}
                </span>
              }
            />
          </div>
          <p className="mt-3 text-[11px] text-subheading leading-relaxed">
            Authorisation only — your card is held but not charged until the
            carer accepts and the shift is marked complete.
          </p>
        </Card>

        {/* Payment method */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-btn bg-primary-50 text-primary grid place-items-center">
              <IconCard />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-heading">
                Apple Pay / Card
              </p>
              <p className="text-[12px] text-subheading">
                Secure checkout via Stripe
              </p>
            </div>
            <span className="text-subheading"><IconLock /></span>
          </div>
        </Card>

        {error && (
          <p className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2">
            {error}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom">
        <Button block disabled={busy} onClick={onPay} aria-busy={busy}>
          {busy ? "Processing…" : `Pay $${total.toFixed(2)}`}
        </Button>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-subheading">{label}</span>
      <span className="text-heading">{value}</span>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

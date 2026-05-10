"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  IconCal,
  IconCheck,
  IconPin,
  TopBar,
} from "../../../_components/ui";
import { type CareFormat } from "../../../_lib/mock";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import { careFormatLabel } from "@/lib/care/formats";
import type {
  ApiCarerResponse,
  ApiCarerProfile,
} from "@/app/api/m/carer/[id]/route";

/**
 * Booking checkout — confirmation summary.
 *
 * Visiting bookings: the previous step (Create Booking) called
 * /api/stripe/create-booking-intent which created a `bookings` row and
 * minted a PaymentIntent. We pass the booking id, client_secret, and
 * total via query params and currently render a "Booking submitted"
 * confirmation. Capturing payment via Stripe PaymentElement is a
 * deliberate follow-up — see TODO below.
 *
 * Live-in bookings: /api/bookings/live-in/request created a
 * `live_in_requests` row and emailed admin. We render a
 * "Request submitted" screen with the weekly subtotal preview.
 */

function narrowCurrency(c: string | null | undefined): "GBP" | "USD" {
  return (c ?? "GBP").toUpperCase() === "USD" ? "USD" : "GBP";
}

function carerName(profile: ApiCarerProfile): string {
  return profile.display_name ?? profile.full_name ?? "Caregiver";
}

function carerLocation(profile: ApiCarerProfile): string {
  const country =
    profile.country?.toUpperCase() === "GB"
      ? "UK"
      : profile.country?.toUpperCase() === "US"
        ? "US"
        : profile.country ?? null;
  return [profile.city, country]
    .filter((s): s is string => Boolean(s))
    .join(", ");
}

function CheckoutInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();

  // ── Real carer fetch ────────────────────────────────────────────
  const [profile, setProfile] = useState<ApiCarerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/m/carer/${params.id}`, {
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
        const json = (await res.json()) as ApiCarerResponse;
        if (!cancelled) {
          setProfile(json.profile);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  // ── Query params from the previous step ────────────────────────
  const careType: CareFormat =
    (sp.get("careType") as CareFormat) === "live_in" ? "live_in" : "visiting";
  const bookingId = sp.get("booking");
  const requestId = sp.get("request");
  const totalCentsParam = sp.get("total");
  const currencyParam = sp.get("currency"); // "gbp" | "usd"
  const weeklyCentsParam = sp.get("weekly");
  const weeksParam = sp.get("weeks");
  const service = sp.get("service") ?? "";

  const currency: "GBP" | "USD" = useMemo(() => {
    const fromQuery = (currencyParam ?? "").toUpperCase();
    if (fromQuery === "USD") return "USD";
    if (fromQuery === "GBP") return "GBP";
    return narrowCurrency(profile?.currency);
  }, [currencyParam, profile]);

  const totalCents: number | null = useMemo(() => {
    if (totalCentsParam) {
      const n = Number(totalCentsParam);
      if (Number.isFinite(n)) return n;
    }
    if (
      careType === "live_in" &&
      weeklyCentsParam &&
      weeksParam
    ) {
      const w = Number(weeklyCentsParam);
      const n = Number(weeksParam);
      if (Number.isFinite(w) && Number.isFinite(n)) return w * n;
    }
    return null;
  }, [totalCentsParam, careType, weeklyCentsParam, weeksParam]);

  if (!loaded) {
    return (
      <main className="min-h-[100dvh] bg-bg-screen pb-32">
        <TopBar back={`/m/book/${params?.id ?? ""}`} title="Checkout" />
        <div className="px-4 pt-4 space-y-4">
          <div className="h-20 rounded-card bg-muted animate-pulse" />
          <div className="h-24 rounded-card bg-muted animate-pulse" />
          <div className="h-24 rounded-card bg-muted animate-pulse" />
        </div>
      </main>
    );
  }

  if (notFound || !profile) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back={`/m/book/${params?.id ?? ""}`} title="Checkout" />
        <p className="px-6 mt-10 text-center text-heading">Carer not found.</p>
      </main>
    );
  }

  const name = carerName(profile);
  const location = carerLocation(profile);

  // The previous step has already created the booking row OR the
  // live-in request row. This page renders confirmation UI.
  //
  // TODO(payments): swap the visiting confirmation for a Stripe
  // PaymentElement that confirms the existing PaymentIntent (we already
  // have `client_secret` in `?cs=…`). When that lands, this page becomes
  // a "Pay £X" form; on confirm the booking moves status `pending →
  // paid`. Until then the booking sits as `pending` and the carer is
  // notified to accept; no card capture happens here.

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back={`/m/book/${profile.user_id}`} title="Checkout" />

      <div className="px-4 pt-4 space-y-4">
        {/* Submitted banner */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-primary text-white">
              <IconCheck />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-heading">
                {careType === "live_in"
                  ? "Live-in request submitted"
                  : "Booking submitted"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-subheading">
                {careType === "live_in"
                  ? "We'll match a carer and email you a quote shortly."
                  : `We've sent your booking request to ${name}. They have 24 hours to accept.`}
              </p>
              <p className="mt-2">
                <span className="inline-flex items-center rounded-pill bg-primary-50 text-primary px-2.5 py-1 text-[11px] font-bold">
                  Awaiting carer response
                </span>
              </p>
            </div>
          </div>
        </Card>

        {/* Carer summary */}
        <Card>
          <div className="flex items-center gap-3">
            <Avatar
              src={profile.photo_url ?? profile.avatar_url ?? undefined}
              name={name}
              size={56}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold text-heading">{name}</p>
              {location && (
                <p className="text-[12px] text-subheading inline-flex items-center gap-1 mt-0.5">
                  <IconPin /> {location}
                </p>
              )}
              {service && (
                <p className="mt-1">
                  <span className="inline-flex items-center rounded-pill bg-primary-50 text-primary px-2.5 py-0.5 text-[11px] font-bold">
                    {serviceLabel(service)}
                  </span>
                </p>
              )}
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
              <span className="text-subheading"><IconCal /></span>
              <span className="font-semibold">{careFormatLabel(careType)}</span>
            </li>
            {bookingId && (
              <li className="flex items-center gap-2 text-[12px] text-subheading">
                Booking ref:{" "}
                <span className="font-mono text-heading">
                  {bookingId.slice(0, 8)}
                </span>
              </li>
            )}
            {requestId && (
              <li className="flex items-center gap-2 text-[12px] text-subheading">
                Request ref:{" "}
                <span className="font-mono text-heading">
                  {requestId.slice(0, 8)}
                </span>
              </li>
            )}
          </ul>
        </Card>

        {/* Total — visiting from API total_cents, live-in derived. */}
        {totalCents != null && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-2">Total</p>
            <p className="text-[20px] font-bold text-heading">
              {formatMoney(totalCents, currency)}
            </p>
            <p className="mt-2 text-[11.5px] text-subheading leading-relaxed">
              {careType === "live_in"
                ? "Indicative weekly subtotal — final quote follows confirmation."
                : "Authorisation only — your card is held but not charged until the carer accepts and the shift is marked complete."}
            </p>
          </Card>
        )}
      </div>

      {/* Sticky CTAs */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 pb-3 sc-safe-bottom space-y-2">
        <Link href="/m/bookings" className="block">
          <Button block>View in Bookings</Button>
        </Link>
        <Link
          href="/m/home"
          className="block text-center text-primary font-bold text-[14px] py-2"
        >
          Done
        </Link>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

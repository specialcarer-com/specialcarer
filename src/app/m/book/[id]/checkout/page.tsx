"use client";

import Link from "next/link";
import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
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
import { getStripe } from "@/lib/stripe/client";
import type {
  ApiCarerResponse,
  ApiCarerProfile,
} from "@/app/api/m/carer/[id]/route";

/**
 * Booking checkout — payment + confirmation.
 *
 * Visiting bookings (with `?cs=…`):
 *   The previous step (Create Booking) already minted a manual-capture
 *   PaymentIntent (`requires_capture` mode). This page mounts Stripe
 *   Elements with that client_secret, renders <PaymentElement />, and
 *   confirms via `stripe.confirmPayment`. Stripe handles the redirect
 *   back to /m/bookings/{booking_id} via `return_url`. We do NOT pass
 *   `capture_method` on confirm — the PI already has it set server-side.
 *
 * Visiting fallback (no client_secret) and live-in bookings:
 *   Show a "Booking submitted" / "Live-in request submitted"
 *   confirmation summary. Live-in has no PaymentIntent (the request
 *   just emails ops).
 */

const STRIPE_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0E7C7B",
    colorText: "#0F1416",
    colorTextSecondary: "#475569",
    colorDanger: "#C22",
    fontFamily:
      "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
};

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
  const clientSecret = sp.get("cs");
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

  // ── Referral credit ─────────────────────────────────────────────
  // Pull the seeker's available balance + offer to apply it to this
  // booking. We keep the booking's total_cents intact (carer payout
  // invariant) and just lower the PaymentIntent amount via /apply-credit.
  const [availableCents, setAvailableCents] = useState<number>(0);
  const [appliedCents, setAppliedCents] = useState<number>(0);
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/referral", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const j = (await res.json()) as { available_cents?: number };
        if (!cancelled && typeof j.available_cents === "number") {
          setAvailableCents(j.available_cents);
        }
      } catch {
        /* soft-fail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const maxApplicableCents =
    totalCents != null
      ? Math.min(availableCents, Math.floor(totalCents * 0.5))
      : 0;
  const dueNowCents =
    totalCents != null ? Math.max(0, totalCents - appliedCents) : null;

  async function applyCredit() {
    if (!bookingId || creditBusy) return;
    setCreditBusy(true);
    setCreditError(null);
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/apply-credit`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const j = (await res.json().catch(() => ({}))) as {
        applied_cents?: number;
        error?: string;
      };
      if (!res.ok) {
        setCreditError(j.error ?? "Could not apply credit.");
        return;
      }
      setAppliedCents(j.applied_cents ?? 0);
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "Could not apply credit.");
    } finally {
      setCreditBusy(false);
    }
  }
  async function removeCredit() {
    if (!bookingId || creditBusy) return;
    setCreditBusy(true);
    setCreditError(null);
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/apply-credit`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setCreditError(j.error ?? "Could not remove credit.");
        return;
      }
      setAppliedCents(0);
    } catch (err) {
      setCreditError(err instanceof Error ? err.message : "Could not remove credit.");
    } finally {
      setCreditBusy(false);
    }
  }

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

  // Visiting bookings with a client_secret render the real Stripe
  // PaymentElement form. Live-in bookings (and visiting fallback when
  // `cs` is missing — shouldn't happen in normal flow) keep the
  // confirmation summary unchanged.
  const hasPaymentForm = careType === "visiting" && !!clientSecret && !!bookingId;

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back={`/m/book/${profile.user_id}`} title="Checkout" />

      <div className="px-4 pt-4 space-y-4">
        {/* Status banner — different copy when payment is required. */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-primary text-white">
              <IconCheck />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-heading">
                {hasPaymentForm
                  ? "Confirm payment"
                  : careType === "live_in"
                    ? "Live-in request submitted"
                    : "Booking submitted"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-subheading">
                {hasPaymentForm
                  ? `Authorise your card to send the request to ${name}.`
                  : careType === "live_in"
                    ? "We'll match a carer and email you a quote shortly."
                    : `We've sent your booking request to ${name}. They have 24 hours to accept.`}
              </p>
              {!hasPaymentForm && (
                <p className="mt-2">
                  <span className="inline-flex items-center rounded-pill bg-primary-50 text-primary px-2.5 py-1 text-[11px] font-bold">
                    Awaiting carer response
                  </span>
                </p>
              )}
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

        {/* Referral credit — visiting only, while a booking + balance exist. */}
        {careType === "visiting" &&
          bookingId &&
          totalCents != null &&
          availableCents > 0 && (
            <Card>
              <p className="text-[14px] font-bold text-heading mb-1">
                Referral credit
              </p>
              <p className="text-[12.5px] text-subheading">
                You have{" "}
                <span className="font-semibold text-heading">
                  {formatMoney(availableCents, currency)}
                </span>{" "}
                in referral credit available.
              </p>
              {appliedCents === 0 ? (
                <>
                  <p className="mt-1 text-[11.5px] text-subheading leading-relaxed">
                    Apply up to{" "}
                    <span className="font-semibold text-heading">
                      {formatMoney(maxApplicableCents, currency)}
                    </span>{" "}
                    (50% of this booking).
                  </p>
                  <div className="mt-3">
                    <Button
                      onClick={applyCredit}
                      disabled={creditBusy || maxApplicableCents <= 0}
                    >
                      {creditBusy
                        ? "Applying…"
                        : `Apply ${formatMoney(maxApplicableCents, currency)} credit`}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[12.5px] text-heading">
                    <span className="font-semibold">
                      −{formatMoney(appliedCents, currency)}
                    </span>{" "}
                    applied to this booking.
                  </p>
                  <button
                    type="button"
                    onClick={removeCredit}
                    disabled={creditBusy}
                    className="mt-2 text-[12.5px] text-primary font-semibold underline underline-offset-2 disabled:opacity-60"
                  >
                    {creditBusy ? "Removing…" : "Remove credit"}
                  </button>
                </>
              )}
              {creditError && (
                <p
                  aria-live="polite"
                  className="mt-2 text-[12px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-2.5 py-1.5"
                >
                  {creditError}
                </p>
              )}
            </Card>
          )}

        {/* Total — visiting from API total_cents, live-in derived. */}
        {totalCents != null && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-2">Total</p>
            {appliedCents > 0 && dueNowCents != null ? (
              <>
                <ul className="space-y-1 text-[13.5px] text-heading">
                  <li className="flex items-center justify-between">
                    <span className="text-subheading">Subtotal</span>
                    <span>{formatMoney(totalCents, currency)}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-subheading">Referral credit</span>
                    <span className="text-primary">
                      −{formatMoney(appliedCents, currency)}
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-[20px] font-bold text-heading flex items-center justify-between">
                  <span>Due now</span>
                  <span>{formatMoney(dueNowCents, currency)}</span>
                </p>
              </>
            ) : (
              <p className="text-[20px] font-bold text-heading">
                {formatMoney(totalCents, currency)}
              </p>
            )}
            <p className="mt-2 text-[11.5px] text-subheading leading-relaxed">
              {careType === "live_in"
                ? "Indicative weekly subtotal — final quote follows confirmation."
                : "Authorisation only — your card is held but not charged until the carer accepts and the shift is marked complete."}
            </p>
          </Card>
        )}

        {/* Stripe payment form — visiting branch only. */}
        {hasPaymentForm && clientSecret && bookingId && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-3">Payment</p>
            <Elements
              stripe={getStripe()}
              options={{
                clientSecret,
                appearance: STRIPE_APPEARANCE,
              }}
            >
              <PayWithStripe
                bookingId={bookingId}
                totalCents={totalCents}
                currency={currency}
              />
            </Elements>
          </Card>
        )}
      </div>

      {/* Bottom CTAs only when there's no payment form (otherwise the
          Pay button inside the Stripe Elements card is the primary
          action). Live-in still shows "View bookings" / "Done". */}
      {!hasPaymentForm && (
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
      )}
    </main>
  );
}

/**
 * Inner Stripe form. Must live inside <Elements> so useStripe /
 * useElements resolve. On submit calls confirmPayment with a
 * return_url; Stripe will redirect to /m/bookings/{booking_id} once
 * the PI moves to `requires_capture`.
 */
function PayWithStripe({
  bookingId,
  totalCents,
  currency,
}: {
  bookingId: string;
  totalCents: number | null;
  currency: "GBP" | "USD";
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonLabel = totalCents != null
    ? `Pay ${formatMoney(totalCents, currency)}`
    : "Authorise card";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Build an absolute return_url. Stripe requires absolute.
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const returnUrl = `${origin}/m/bookings/${encodeURIComponent(bookingId)}`;

      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
      });

      // If we get here without a redirect, something went wrong —
      // typically validation or card error. Stripe still mutates the
      // PI; expose the message inline.
      if (stripeError) {
        setError(stripeError.message ?? "Payment could not be confirmed.");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PaymentElement />

      {error && (
        <p
          aria-live="polite"
          className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2"
        >
          {error}
        </p>
      )}

      <Button block type="submit" disabled={!stripe || !elements || busy}>
        {busy ? "Processing…" : buttonLabel}
      </Button>

      <p className="text-[11.5px] text-subheading leading-relaxed">
        Your card is authorised now. We capture payment after the shift is
        completed and a 24-hour hold.
      </p>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

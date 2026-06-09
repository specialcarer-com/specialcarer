"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, IconClock, IconPin } from "../_components/ui";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import type { CarerMatchOffer } from "@/app/api/m/me/match-offers/route";

/**
 * Carer-side auto-match offers (gap 17), shown atop the "Inbox" tab.
 *
 * Lists pending offers from /api/m/me/match-offers and lets the carer
 * Accept or Decline (with an optional reason). Self-contained so wiring it
 * into MyWorkClient is a single mount line.
 */

const DECLINE_REASONS = [
  "Too far away",
  "Not available then",
  "Rate too low",
  "Not my specialism",
];

function fmtWhen(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Time TBC";
  const s = new Date(startsAt);
  const date = s.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (!endsAt) return `${date} · ${t(s)}`;
  return `${date} · ${t(s)}–${t(new Date(endsAt))}`;
}

function fmtExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Expires in ${mins}m`;
  return `Expires in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function OfferCard({
  offer,
  pending,
  onAccept,
  onDecline,
}: {
  offer: CarerMatchOffer;
  pending: boolean;
  onAccept: (offer: CarerMatchOffer) => void;
  onDecline: (offer: CarerMatchOffer, reason: string | null) => void;
}) {
  const [declining, setDeclining] = useState(false);
  const amount =
    offer.hourly_rate_cents != null && offer.hours != null
      ? formatMoney(
          offer.hourly_rate_cents * offer.hours,
          (offer.currency?.toUpperCase() as "GBP" | "USD") ?? "GBP",
        )
      : null;

  return (
    <div className="rounded-card bg-white border border-line p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-semibold"
          style={{ background: "rgba(3,158,160,0.10)", color: "#039EA0" }}
        >
          {Math.round(offer.score)}% match
        </span>
        {amount && (
          <span className="text-[16px] font-bold text-heading">{amount}</span>
        )}
      </div>

      <p className="text-[15px] font-bold text-heading leading-tight">
        {offer.seeker_first_name ?? "A family"}
        {offer.service_type ? ` · ${serviceLabel(offer.service_type)}` : ""}
      </p>

      <p className="flex items-center gap-1.5 text-[13px] text-subheading">
        <IconClock />
        {fmtWhen(offer.starts_at, offer.ends_at)}
      </p>
      {offer.location_city && (
        <p className="flex items-center gap-1.5 text-[13px] text-subheading">
          <IconPin />
          {offer.location_city}
        </p>
      )}
      <p className="text-[12px] font-semibold text-amber-600">
        {fmtExpiry(offer.expires_at)}
      </p>

      {!declining ? (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            Decline
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            disabled={pending}
            onClick={() => onAccept(offer)}
          >
            Accept
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pt-1">
          <p className="text-[12px] text-subheading">
            Why are you declining? (optional)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DECLINE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={pending}
                onClick={() => onDecline(offer, r)}
                className="rounded-pill border border-line px-3 py-1.5 text-[12px] font-semibold text-heading active:bg-muted"
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={() => setDeclining(false)}
            >
              Back
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={() => onDecline(offer, null)}
            >
              Decline anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobOffersSection() {
  const [offers, setOffers] = useState<CarerMatchOffer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/m/me/match-offers", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const j = (await res.json()) as { offers: CarerMatchOffer[] };
        setOffers(j.offers ?? []);
      }
    } catch {
      /* best-effort */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = useCallback(
    async (
      offer: CarerMatchOffer,
      action: "accept" | "decline",
      reason: string | null,
    ) => {
      if (pendingId) return;
      setPendingId(offer.offer_id);
      try {
        const res = await fetch(
          `/api/m/bookings/${offer.booking_id}/offers/${offer.offer_id}/respond`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, reason }),
          },
        );
        if (res.ok) {
          setOffers((prev) =>
            prev.filter((o) => o.offer_id !== offer.offer_id),
          );
        }
      } catch {
        /* best-effort */
      } finally {
        setPendingId(null);
      }
    },
    [pendingId],
  );

  if (!loaded || offers.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-[14px] font-bold text-heading">
        Job offers for you
      </p>
      {offers.map((o) => (
        <OfferCard
          key={o.offer_id}
          offer={o}
          pending={pendingId === o.offer_id}
          onAccept={(off) => respond(off, "accept", null)}
          onDecline={(off, reason) => respond(off, "decline", reason)}
        />
      ))}
    </section>
  );
}

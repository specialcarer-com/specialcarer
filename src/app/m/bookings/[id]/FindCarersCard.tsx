"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, Stars } from "../../_components/ui";
import type {
  FindMatchesResponse,
  MatchOfferCard,
} from "@/app/api/m/bookings/[id]/find-matches/route";

/**
 * Seeker-side "Find carers" surface (gap 17).
 *
 * Tapping the button POSTs to find-matches, which computes the top 5 carer
 * candidates and pushes each an offer. The returned cards render here and
 * then update live over Realtime as carers accept/decline.
 *
 * Mounted on the booking detail page. Self-contained so the diff to the
 * page stays a single import + one line.
 */

const TEAL = "#039EA0";

type OfferStatus = MatchOfferCard["status"];

function statusChip(status: OfferStatus): { label: string; cls: string } {
  switch (status) {
    case "accepted":
      return { label: "Accepted", cls: "bg-emerald-50 text-emerald-700" };
    case "declined":
      return { label: "Declined", cls: "bg-zinc-100 text-zinc-500" };
    case "expired":
      return { label: "Expired", cls: "bg-zinc-100 text-zinc-500" };
    default:
      return { label: "Waiting…", cls: "bg-amber-50 text-amber-700" };
  }
}

export default function FindCarersCard({ bookingId }: { bookingId: string }) {
  const [offers, setOffers] = useState<MatchOfferCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poolSize, setPoolSize] = useState<number | null>(null);

  const findCarers = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/m/bookings/${bookingId}/find-matches`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setError("Couldn’t find carers right now. Please try again.");
        return;
      }
      const json = (await res.json()) as FindMatchesResponse;
      setOffers(json.offers);
      setPoolSize(json.pool_size);
    } catch {
      setError("Couldn’t find carers right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [bookingId, loading]);

  // Live offer updates — patch status as carers respond.
  useEffect(() => {
    if (!offers) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`match_offers:booking_id=eq.${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "booking_match_offers",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const row = payload.new as { carer_id: string; status: OfferStatus };
          setOffers((prev) =>
            prev
              ? prev.map((o) =>
                  o.carer_id === row.carer_id ? { ...o, status: row.status } : o,
                )
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, offers]);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-heading">Find carers</p>
        {poolSize != null && (
          <span className="text-[12px] text-subheading">
            {poolSize} nearby
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] text-subheading leading-relaxed">
        We’ll match you with the best-fit carers nearby and notify them
        instantly. You’ll see their replies here live.
      </p>

      {error && (
        <p className="mt-2 text-[12px] text-red-600">{error}</p>
      )}

      {offers && offers.length === 0 && !loading && (
        <p className="mt-3 text-[13px] text-subheading">
          No available carers matched right now. Try again shortly.
        </p>
      )}

      {offers && offers.length > 0 && (
        <ul className="mt-3 space-y-2">
          {offers.map((o) => {
            const chip = statusChip(o.status);
            return (
              <li
                key={o.carer_id}
                className="flex items-center gap-3 rounded-card border border-line px-3 py-2.5"
              >
                <Avatar
                  src={o.photo_url ?? undefined}
                  name={o.display_name ?? "Carer"}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-heading">
                    {o.display_name ?? "Carer"}
                  </p>
                  <div className="flex items-center gap-2 text-[12px] text-subheading">
                    {o.rating_avg != null && o.rating_count > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Stars value={o.rating_avg} size={12} />
                        {o.rating_avg.toFixed(1)}
                      </span>
                    ) : (
                      <span>New carer</span>
                    )}
                    {o.city && <span>· {o.city}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}
                  >
                    {chip.label}
                  </span>
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: TEAL }}
                  >
                    {Math.round(o.score)}% match
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        <Button
          block
          size="sm"
          variant={offers ? "outline" : "primary"}
          onClick={findCarers}
          disabled={loading}
        >
          {loading
            ? "Finding carers…"
            : offers
              ? "Find more carers"
              : "Find carers for me"}
        </Button>
      </div>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar, Avatar, Stars } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  reviewer_id: string;
  booking_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  bookings: { service_type: string | null } | null;
};

const SERVICE_LABEL: Record<string, string> = {
  elderly_care: "Elderly care",
  childcare: "Childcare",
  special_needs: "Special-needs",
  postnatal: "Postnatal",
  complex_care: "Complex care",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  if (ms < day) return "Today";
  if (ms < day * 2) return "Yesterday";
  const days = Math.floor(ms / day);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

export default function MyReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setReviews([]);
            setErr("Sign in to see your reviews.");
          }
          return;
        }
        const { data, error } = await supabase
          .from("reviews")
          .select(
            `id, rating, body, created_at, reviewer_id, booking_id,
             profiles:profiles!reviews_reviewer_id_fkey(full_name, avatar_url),
             bookings:bookings!reviews_booking_id_fkey(service_type)`,
          )
          .eq("caregiver_id", user.id)
          .is("hidden_at", null)
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (error) {
          setErr(error.message);
          setReviews([]);
          return;
        }
        type Raw = {
          id: string;
          rating: number;
          body: string | null;
          created_at: string;
          reviewer_id: string;
          booking_id: string | null;
          profiles:
            | { full_name: string | null; avatar_url: string | null }
            | { full_name: string | null; avatar_url: string | null }[]
            | null;
          bookings:
            | { service_type: string | null }
            | { service_type: string | null }[]
            | null;
        };
        // The supabase types collapse joined relations to arrays when
        // keys aren't enforced — coerce defensively here.
        const normalised: ReviewRow[] = ((data ?? []) as Raw[]).map((r) => ({
          ...r,
          profiles: Array.isArray(r.profiles)
            ? (r.profiles[0] ?? null)
            : r.profiles,
          bookings: Array.isArray(r.bookings)
            ? (r.bookings[0] ?? null)
            : r.bookings,
        }));
        setReviews(normalised);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Couldn't load reviews.");
          setReviews([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (reviews === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-8">
        <TopBar title="My reviews" back="/m/profile" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  const avg =
    reviews.length === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="My reviews" back="/m/profile" />

      <div className="px-5 pt-2">
        <div className="rounded-card bg-white p-5 text-center shadow-card">
          <p className="text-[40px] font-bold leading-none text-heading">
            {reviews.length === 0 ? "—" : avg.toFixed(1)}
          </p>
          {reviews.length > 0 && (
            <div className="mt-2 flex justify-center">
              <Stars value={avg} />
            </div>
          )}
          <p className="mt-2 text-[12px] text-subheading">
            {reviews.length === 0
              ? "No reviews yet — they'll appear after your first completed booking."
              : `Based on ${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div className="mt-3 px-5">
        <Link
          href="/m/profile/blocks"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
        >
          Manage blocked carers →
        </Link>
      </div>

      {err && <p className="mt-3 px-5 text-[12px] text-rose-700">{err}</p>}

      <ul className="mt-4 flex flex-col gap-3 px-5">
        {reviews.map((r) => {
          const author = r.profiles?.full_name?.trim() || "Anonymous";
          const avatar = r.profiles?.avatar_url ?? undefined;
          const service = r.bookings?.service_type
            ? (SERVICE_LABEL[r.bookings.service_type] ?? r.bookings.service_type)
            : null;
          return (
            <li key={r.id} className="rounded-card bg-white p-4 shadow-card">
              <div className="flex items-start gap-3">
                <Avatar src={avatar} name={author} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[14px] font-semibold text-heading">
                      {author}
                    </p>
                    <span className="shrink-0 text-[11px] text-subheading">
                      {formatRelative(r.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Stars value={r.rating} size={12} />
                    {service && (
                      <span className="text-[11px] text-subheading">
                        {service}
                      </span>
                    )}
                  </div>
                  {r.body && (
                    <p className="mt-2 text-[13.5px] leading-snug text-heading">
                      {r.body}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

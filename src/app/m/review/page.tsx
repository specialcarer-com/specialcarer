"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Avatar,
  BottomNav,
  Card,
  IconChevronRight,
  NotificationBell,
  Stars,
  TopBar,
} from "../_components/ui";
import { serviceLabel } from "@/lib/care/services";
import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";
import {
  isHubEmpty,
  sortPendingNewestFirst,
  sortWrittenNewestFirst,
} from "@/lib/m/review-hub";
import type {
  ApiReviewHubResponse,
  ApiPendingReviewItem,
  ApiWrittenReviewItem,
} from "@/app/api/m/reviews/pending/route";

/**
 * Review hub (PR-R4, /m/review). Seeker-only — middleware enforces the role.
 *
 * Lists completed bookings the seeker hasn't reviewed yet (newest first). When
 * there is nothing pending, shows a friendly empty state and, below it, the
 * seeker's previously-written reviews (read-only, each with an edit affordance).
 */

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function PendingRow({ item }: { item: ApiPendingReviewItem }) {
  const name = item.caregiver_name ?? "Your caregiver";
  return (
    <Link href={`/m/review/${item.booking_id}`} className="block">
      <Card>
        <div className="flex items-center gap-3">
          <Avatar src={item.caregiver_avatar ?? undefined} name={name} size={52} />
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-heading truncate">{name}</p>
            <p className="mt-0.5 text-[13px] text-subheading truncate">
              {item.service_type ? serviceLabel(item.service_type) : "Completed booking"}
              {item.starts_at && ` · ${fmtDate(item.starts_at)}`}
            </p>
          </div>
          <span className="text-subheading">
            <IconChevronRight />
          </span>
        </div>
      </Card>
    </Link>
  );
}

function WrittenRow({ item }: { item: ApiWrittenReviewItem }) {
  const name = item.caregiver_name ?? "Your caregiver";
  return (
    <Link href={`/m/review/${item.booking_id}`} className="block">
      <Card>
        <div className="flex items-start gap-3">
          <Avatar src={item.caregiver_avatar ?? undefined} name={name} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[15px] font-bold text-heading truncate">{name}</p>
              <span className="text-[12px] text-primary font-semibold shrink-0">
                Edit
              </span>
            </div>
            <div className="mt-1">
              <Stars value={item.rating} />
            </div>
            {item.body && (
              <p className="mt-2 text-[13px] text-heading line-clamp-3">
                {item.body}
              </p>
            )}
            <p className="mt-2 text-[12px] text-subheading">
              {fmtDate(item.created_at)}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function ReviewHubPage() {
  const redesign = isMobileRedesignEnabled();
  const [data, setData] = useState<ApiReviewHubResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/reviews/pending", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setData({ pending: [], written: [] });
          if (res.status !== 401) setErr("Could not load reviews.");
          return;
        }
        const json = (await res.json()) as ApiReviewHubResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          setData({ pending: [], written: [] });
          setErr("Could not load reviews.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = data ? sortPendingNewestFirst(data.pending) : [];
  const written = data ? sortWrittenNewestFirst(data.written) : [];
  const empty = data ? isHubEmpty(data.pending) : false;

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar back="/m/home" title="Reviews" right={<NotificationBell />} />

      <div className="px-4 mt-4 space-y-4">
        {data === null && (
          <>
            <ReviewRowSkeleton />
            <ReviewRowSkeleton />
          </>
        )}

        {data !== null && err && (
          <p
            aria-live="polite"
            className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2"
          >
            {err}
          </p>
        )}

        {/* Pending reviews — the primary action list. */}
        {data !== null && !empty && (
          <section className="space-y-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-subheading">
              To review
            </h2>
            {pending.map((p) => (
              <PendingRow key={p.booking_id} item={p} />
            ))}
          </section>
        )}

        {/* Empty state — nothing pending. */}
        {data !== null && empty && (
          <Card className="text-center py-10">
            <div aria-hidden="true" className="text-[40px] leading-none">
              ⭐
            </div>
            <p className="mt-3 text-heading font-semibold">
              Nothing to review right now.
            </p>
            <p className="mt-2 text-[13px] text-subheading">
              Your past reviews are listed below.
            </p>
          </Card>
        )}

        {/* Previously-written reviews. */}
        {data !== null && written.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-subheading">
              Your reviews
            </h2>
            {written.map((w) => (
              <WrittenRow key={w.booking_id} item={w} />
            ))}
          </section>
        )}

        {/* Fully empty — no pending and no past reviews. */}
        {data !== null && empty && written.length === 0 && !err && (
          <p className="text-center text-[13px] text-subheading">
            Once you complete a booking you&apos;ll be able to review your
            caregiver here.
          </p>
        )}
      </div>

      {redesign && <BottomNav active="review" role="seeker" />}
    </main>
  );
}

function ReviewRowSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </Card>
  );
}

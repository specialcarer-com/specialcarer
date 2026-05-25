"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Avatar,
  BottomNav,
  Button,
  Card,
  IconCal,
  IconChatBubble,
  IconChevronRight,
  IconFilter,
  IconJournal,
  IconMail,
  IconPhone,
  IconPin,
  IconSearch,
  IconStar,
  NotificationBell,
  SectionTitle,
  Tag,
} from "../_components/ui";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import { createClient } from "@/lib/supabase/client";
import type { ApiFeaturedCarer } from "@/app/api/m/carers/featured/route";
import type {
  ApiUpcomingBooking,
  ApiUpcomingBookingsResponse,
} from "@/app/api/m/bookings/upcoming/route";
import type { ApiRecentCarer } from "@/app/api/m/carers/recent/route";
import { CarerTile } from "../_components/CarerTile";

/**
 * Home (seeker) — Figma 7:1652.
 * Welcome / search bar / Upcoming Bookings / Care journal / Professionals.
 *
 * Both the Professionals strip and the Upcoming Bookings card are now
 * backed by real database queries (/api/m/carers/featured and
 * /api/m/bookings/upcoming respectively). The mock CAREGIVERS / BOOKINGS
 * arrays are no longer referenced from this page.
 */

export default function SeekerHomeClient() {
  const [name, setName] = useState("there");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [journalCount, setJournalCount] = useState<number | null>(null);

  // Pull the user's display name + avatar from Supabase (best-effort).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const user = data.user;
        const meta = user?.user_metadata as
          | { full_name?: string; first_name?: string; avatar_url?: string }
          | undefined;
        const display =
          meta?.first_name ||
          meta?.full_name?.split(" ")[0] ||
          user?.email?.split("@")[0] ||
          "there";
        setName(display);
        if (meta?.avatar_url) setAvatarUrl(meta.avatar_url);
        if (user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", user.id)
            .maybeSingle();
          if (!cancelled && prof?.avatar_url) setAvatarUrl(prof.avatar_url);
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lightweight count of recent journal entries.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/journal?limit=5", {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { entries?: { id: string }[] };
        if (cancelled) return;
        setJournalCount(json.entries?.length ?? 0);
      } catch {
        /* keep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Recent carers for the "Book again" quick-rebook strip. `null` while
  // loading; empty array hides the section entirely.
  const [recent, setRecent] = useState<ApiRecentCarer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/carers/recent?limit=3", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setRecent([]);
          return;
        }
        const json = (await res.json()) as { carers?: ApiRecentCarer[] };
        if (!cancelled) setRecent(json.carers ?? []);
      } catch {
        if (!cancelled) setRecent([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Real published carers — replaces the mock CAREGIVERS slice.
  const [featured, setFeatured] = useState<ApiFeaturedCarer[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/carers/featured", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setFeatured([]);
          return;
        }
        const json = (await res.json()) as { carers?: ApiFeaturedCarer[] };
        if (!cancelled) setFeatured(json.carers ?? []);
      } catch {
        if (!cancelled) setFeatured([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Upcoming bookings — real data from /api/m/bookings/upcoming. The home
  // surface only shows the next one; the "View All" link routes to the
  // full list at /m/bookings.
  const [upcomingBookings, setUpcomingBookings] = useState<
    ApiUpcomingBooking[] | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/bookings/upcoming?limit=3", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setUpcomingBookings([]);
          return;
        }
        const json = (await res.json()) as ApiUpcomingBookingsResponse;
        if (!cancelled) setUpcomingBookings(json.bookings ?? []);
      } catch {
        if (!cancelled) setUpcomingBookings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const upcoming = upcomingBookings?.[0] ?? null;

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      {/* Sticky white "header" — avatar + name + bell. */}
      <header className="sc-safe-top sticky top-0 z-30 bg-white px-4 pb-4">
        <div className="flex items-center justify-between pt-2">
          <Link href="/m/profile" className="flex items-center gap-3 sc-no-select">
            <Avatar
              size={42}
              name={name}
              src={avatarUrl || undefined}
            />
            <div className="leading-tight">
              <p className="text-[12px] text-subheading">Welcome!</p>
              <p className="text-[15px] font-bold text-heading capitalize">
                {name}
              </p>
            </div>
          </Link>
          <NotificationBell />
        </div>

        {/* Search + filter */}
        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/m/search"
            className="flex-1 h-12 rounded-btn border border-line bg-white px-4 flex items-center gap-3 text-subheading sc-no-select"
          >
            <IconSearch />
            <span className="text-[14px]">Search Here…</span>
          </Link>
          <Link
            href="/m/search?filter=open"
            aria-label="Filter"
            className="h-12 w-12 rounded-btn bg-primary text-white grid place-items-center sc-no-select"
          >
            <IconFilter />
          </Link>
        </div>
      </header>

      {/* Unified booking entry — Now / Schedule / Recurring picker. */}
      <div className="px-4 pt-3">
        <Link href="/m/book" className="block sc-no-select">
          <div
            className="rounded-card p-4 flex items-center gap-3"
            style={{
              background:
                "linear-gradient(135deg, rgba(3,158,160,0.10) 0%, rgba(23,30,84,0.06) 100%)",
              border: "1px solid rgba(3,158,160,0.20)",
            }}
          >
            <span
              className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary text-white text-[18px]"
              aria-hidden
            >
              ⚡
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-heading">
                Book care
              </p>
              <p className="text-[12px] text-subheading">
                Now, scheduled, or recurring · live ETA &amp; pricing.
              </p>
            </div>
            <span className="text-primary font-bold text-[13px]">Start</span>
          </div>
        </Link>
      </div>

      {/* Upcoming Bookings — backed by /api/m/bookings/upcoming. */}
      <SectionTitle
        title="Upcoming Bookings"
        action={
          <Link
            href="/m/bookings"
            className="text-primary font-bold text-[13px]"
          >
            View All
          </Link>
        }
      />
      <div className="px-4">
        {upcomingBookings === null ? (
          <UpcomingBookingSkeleton />
        ) : upcoming ? (
          <BookingPreviewCard booking={upcoming} />
        ) : (
          <Card>
            <p className="text-[14px] font-bold text-heading">
              No upcoming bookings
            </p>
            <p className="mt-1 text-[13px] text-subheading">
              Book care to see your next visit here.
            </p>
            <div className="mt-3">
              <Link href="/m/book">
                <Button size="md">Book care</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* Book again — quick-rebook tiles for recent carers. Hidden when
          the seeker has no rebookable bookings. */}
      {recent && recent.length > 0 && (
        <>
          <SectionTitle title="Book again" />
          <div className="px-4">
            <div
              className="flex gap-3 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {recent.map((c) => (
                <CarerTile
                  key={c.id}
                  carerId={c.id}
                  name={c.name}
                  avatarUrl={c.avatar_url}
                  service={c.service}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Care journal quick-access. */}
      <SectionTitle title="Care journal" />
      <div className="px-4">
        <Link href="/m/journal" className="block">
          <Card>
            <div className="flex items-center gap-3">
              <span
                className="grid h-11 w-11 flex-none place-items-center rounded-full"
                style={{ background: "rgba(3,158,160,0.10)", color: "#039EA0" }}
                aria-hidden
              >
                <IconJournal />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-heading">
                  {journalCount && journalCount > 0
                    ? `${journalCount} recent note${journalCount === 1 ? "" : "s"}`
                    : "Daily care notes"}
                </p>
                <p className="text-[12px] text-subheading">
                  Notes, photos and mood updates from each visit.
                </p>
              </div>
              <span className="text-subheading" aria-hidden>
                <IconChevronRight />
              </span>
            </div>
          </Card>
        </Link>
      </div>

      {/* Professionals — backed by /api/m/carers/featured (real DB carers). */}
      <SectionTitle title="Professionals" />
      <div className="px-4 space-y-4">
        {featured === null ? (
          <>
            <CarerCardSkeleton />
            <CarerCardSkeleton />
            <CarerCardSkeleton />
          </>
        ) : featured.length === 0 ? (
          <Card>
            <p className="text-[14px] font-bold text-heading">
              No professionals available in your area yet
            </p>
            <p className="mt-1 text-[13px] text-subheading">
              We&rsquo;re onboarding new carers every week. Try the search to
              browse a wider area.
            </p>
            <div className="mt-3">
              <Link href="/m/search">
                <Button size="md">Browse all carers</Button>
              </Link>
            </div>
          </Card>
        ) : (
          featured.map((c) => <RealCarerCard key={c.user_id} carer={c} />)
        )}
      </div>

      <BottomNav active="home" role="seeker" />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────────────── */

function BookingPreviewCard({ booking }: { booking: ApiUpcomingBooking }) {
  const carer = booking.caregiver;
  const carerName =
    carer?.display_name ?? carer?.full_name ?? "Caregiver TBD";
  const carerPhoto = carer?.photo_url ?? carer?.avatar_url ?? undefined;
  const statusTone = bookingStatusTone(booking.status);
  const statusLabel = bookingStatusLabel(booking.status);
  const locationLine = [booking.location_city, booking.location_country]
    .filter((s): s is string => Boolean(s))
    .join(", ");
  const { dateLabel, timeLabel } = formatStartEnd(
    booking.starts_at,
    booking.ends_at,
  );

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar src={carerPhoto} name={carerName} size={56} />
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold text-heading">{carerName}</p>
          <div className="mt-1.5">
            <Tag tone="primary">{serviceLabel(booking.service_type)}</Tag>
          </div>
        </div>
        <Tag tone={statusTone}>{statusLabel}</Tag>
      </div>

      <ul className="mt-4 space-y-2 text-[13px] text-heading">
        {locationLine && (
          <li className="flex items-center gap-2">
            <span className="text-subheading"><IconPin /></span>
            {locationLine}
          </li>
        )}
        <li className="flex items-center gap-2">
          <span className="text-subheading"><IconCal /></span>
          {dateLabel} | {timeLabel}
        </li>
      </ul>

      <div className="border-t border-line mt-4 pt-3 flex items-center justify-end gap-2">
        <ActionIcon ariaLabel="Call"><IconPhone /></ActionIcon>
        <ActionIcon ariaLabel="Email"><IconMail /></ActionIcon>
        {carer?.user_id && (
          <ActionIcon ariaLabel="Message" href={`/m/chat/${carer.user_id}`}>
            <IconChatBubble />
          </ActionIcon>
        )}
      </div>
    </Card>
  );
}

function bookingStatusTone(
  status: string,
): "amber" | "green" | "red" | "neutral" | "primary" {
  switch (status) {
    case "pending":
      return "amber";
    case "accepted":
    case "paid":
      return "green";
    case "in_progress":
      return "primary";
    default:
      return "neutral";
  }
}

function bookingStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Requested";
    case "accepted":
      return "Accepted";
    case "paid":
      return "Confirmed";
    case "in_progress":
      return "In progress";
    default:
      return status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}

function formatStartEnd(
  startsAt: string,
  endsAt: string,
): { dateLabel: string; timeLabel: string } {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return { dateLabel: "TBD", timeLabel: "" };
  }
  const dateLabel = start.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const startTime = start.toLocaleTimeString(undefined, timeFmt);
  const endTime =
    end && !Number.isNaN(end.getTime())
      ? end.toLocaleTimeString(undefined, timeFmt)
      : "";
  const timeLabel = endTime ? `${startTime} – ${endTime}` : startTime;
  return { dateLabel, timeLabel };
}

function UpcomingBookingSkeleton() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div
          className="h-14 w-14 rounded-full bg-muted animate-pulse"
          aria-hidden
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-3 w-1/4 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-5 w-16 rounded bg-muted animate-pulse" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </Card>
  );
}

function ActionIcon({
  children,
  ariaLabel,
  href,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  href?: string;
}) {
  const cls =
    "h-10 w-10 rounded-btn bg-primary-50 text-primary grid place-items-center sc-no-select";
  return href ? (
    <Link href={href} aria-label={ariaLabel} className={cls}>
      {children}
    </Link>
  ) : (
    <button aria-label={ariaLabel} className={cls}>
      {children}
    </button>
  );
}

/* ── Real-carer card. Visual design mirrors the mock CarerCard so the
   home page looks identical at-a-glance. ────────────────────────── */

function RealCarerCard({ carer }: { carer: ApiFeaturedCarer }) {
  const photo = carer.photo_url ?? carer.avatar_url ?? undefined;
  const name = carer.display_name ?? carer.full_name ?? "Caregiver";
  const ratingBlock =
    carer.rating_count > 0 && carer.rating_avg != null ? (
      <span className="flex items-center gap-1 text-[13px] font-bold text-heading shrink-0">
        {carer.rating_avg.toFixed(1)} <IconStar />
      </span>
    ) : (
      <span className="text-[12px] text-subheading shrink-0">New</span>
    );

  const cityLine = [carer.city, countryLabel(carer.country)]
    .filter((s): s is string => Boolean(s))
    .join(", ");

  const rateLine =
    carer.hourly_rate_cents != null
      ? formatMoney(carer.hourly_rate_cents, carer.currency)
      : null;

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar src={photo} name={name} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-bold text-heading truncate">
              {name}
            </p>
            {ratingBlock}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {carer.services.map((s) => (
              <Tag key={s} tone="primary">
                {serviceLabel(s)}
              </Tag>
            ))}
            {carer.total_services > carer.services.length && (
              <span className="text-[12px] text-primary font-bold">
                &amp; more
              </span>
            )}
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-2 text-[13px] text-heading">
        {cityLine && (
          <li className="flex items-center gap-2">
            <span className="text-subheading">
              <IconPin />
            </span>
            {cityLine}
          </li>
        )}
        {carer.years_experience != null && carer.years_experience > 0 && (
          <li className="flex items-center gap-2">
            <span className="text-subheading">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="9" r="6" />
                <path d="M9 14l-2 7 5-3 5 3-2-7" />
              </svg>
            </span>
            {carer.years_experience}+ years
          </li>
        )}
      </ul>

      <div className="border-t border-line mt-4 pt-3 flex items-center justify-between">
        <p className="text-[12px] text-subheading">
          {rateLine ? (
            <>
              Starting from{" "}
              <span className="text-[18px] font-bold text-heading">
                {rateLine}
              </span>
              <span className="text-[12px] text-subheading">/hr</span>
            </>
          ) : (
            <span className="text-[14px] font-bold text-heading">
              Rate on request
            </span>
          )}
        </p>
        <Link href={`/m/carer/${carer.user_id}?from=home`}>
          <Button size="md">See Profile</Button>
        </Link>
      </div>
    </Card>
  );
}

function CarerCardSkeleton() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div
          className="h-14 w-14 rounded-full bg-muted animate-pulse"
          aria-hidden
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/4 rounded bg-muted animate-pulse" />
      </div>
      <div className="border-t border-line mt-4 pt-3 flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="h-9 w-24 rounded-btn bg-muted animate-pulse" />
      </div>
    </Card>
  );
}

function countryLabel(c: string | null | undefined): string | null {
  if (!c) return null;
  const u = c.toUpperCase();
  if (u === "GB") return "UK";
  if (u === "US") return "US";
  return u;
}

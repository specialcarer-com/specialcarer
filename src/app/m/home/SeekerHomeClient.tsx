"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Avatar,
  BottomNav,
  Button,
  Card,
  CarerBadges,
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
import {
  BOOKINGS,
  CAREGIVERS,
  SERVICE_LABEL,
  STATUS_TONE,
  getCarer,
} from "../_lib/mock";
import { createClient } from "@/lib/supabase/client";

/**
 * Home (seeker) — Figma 7:1652.
 * Welcome / search bar / Upcoming Bookings (1 card) / Professionals list.
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
        // Fast path — metadata copy. Falls through to profiles below
        // for the canonical value.
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

  // Lightweight count of recent journal entries the user can see.
  // Best-effort — if it fails or returns zero we just hide the card.
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

  const upcoming = BOOKINGS.find(
    (b) => b.status === "Requested" || b.status === "Accepted"
  );
  const upcomingCarer = upcoming ? getCarer(upcoming.carerId) : undefined;

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

      {/* Upcoming Bookings */}
      {upcoming && upcomingCarer && (
        <>
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
            <BookingPreviewCard
              carer={upcomingCarer}
              booking={upcoming}
            />
          </div>
        </>
      )}

      {/* Care journal quick-access. Always visible for signed-in users so
          they can both add a note and review the recent timeline. */}
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

      {/* Professionals */}
      <SectionTitle title="Professionals" />
      <div className="px-4 space-y-4">
        {CAREGIVERS.slice(0, 6).map((c) => (
          <CarerCard key={c.id} carer={c} />
        ))}
      </div>

      <BottomNav active="home" role="seeker" />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────────────── */

function BookingPreviewCard({
  carer,
  booking,
}: {
  carer: ReturnType<typeof getCarer> & object;
  booking: (typeof BOOKINGS)[number];
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar src={carer.photo} name={carer.name} size={56} />
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold text-heading">{carer.name}</p>
          <div className="mt-1.5">
            <Tag tone="primary">{booking.service}</Tag>
          </div>
        </div>
        <Tag tone={STATUS_TONE[booking.status]}>{booking.status}</Tag>
      </div>

      <ul className="mt-4 space-y-2 text-[13px] text-heading">
        <li className="flex items-center gap-2">
          <span className="text-subheading"><IconPin /></span>
          {booking.address}
        </li>
        <li className="flex items-center gap-2">
          <span className="text-subheading"><IconCal /></span>
          Slot — {booking.slot}
        </li>
        <li className="flex items-center gap-2">
          <span className="text-subheading"><IconCal /></span>
          {booking.date} | {booking.time}
        </li>
      </ul>

      <div className="border-t border-line mt-4 pt-3 flex items-center justify-end gap-2">
        <ActionIcon ariaLabel="Call"><IconPhone /></ActionIcon>
        <ActionIcon ariaLabel="Email"><IconMail /></ActionIcon>
        <ActionIcon ariaLabel="Message" href={`/m/chat/${carer.id}`}>
          <IconChatBubble />
        </ActionIcon>
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

function CarerCard({ carer }: { carer: (typeof CAREGIVERS)[number] }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar src={carer.photo} name={carer.name} size={56} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-bold text-heading truncate">
              {carer.name}
            </p>
            <span className="flex items-center gap-1 text-[13px] font-bold text-heading shrink-0">
              {carer.rating.toFixed(1)} <IconStar />
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {carer.services.slice(0, 2).map((s) => (
              <Tag key={s} tone="primary">
                {SERVICE_LABEL[s]}
              </Tag>
            ))}
            {carer.services.length > 2 && (
              <span className="text-[12px] text-primary font-bold">
                &amp; more
              </span>
            )}
            <CarerBadges
              isClinical={carer.isClinical}
              isNurse={carer.isNurse}
              compact
            />
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-2 text-[13px] text-heading">
        <li className="flex items-center gap-2">
          <span className="text-subheading"><IconPin /></span>
          {carer.city}
        </li>
        <li className="flex items-center gap-2">
          <span className="text-subheading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="9" r="6"/><path d="M9 14l-2 7 5-3 5 3-2-7"/>
            </svg>
          </span>
          {carer.experienceYears}+ years
        </li>
      </ul>

      <div className="border-t border-line mt-4 pt-3 flex items-center justify-between">
        <p className="text-[12px] text-subheading">
          Starting from{" "}
          <span className="text-[18px] font-bold text-heading">
            ${carer.hourly.usd}
          </span>
          <span className="text-[12px] text-subheading">/hr</span>
        </p>
        <Link href={`/m/carer/${carer.id}`}>
          <Button size="md">See Profile</Button>
        </Link>
      </div>
    </Card>
  );
}

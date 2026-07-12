"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  BottomNav,
  Card,
  IconCal,
  IconChatBubble,
  IconFilter,
  IconMail,
  IconPhone,
  IconPin,
  NotificationBell,
  Tag,
  TopBar,
} from "../_components/ui";
import { serviceLabel, formatMoney } from "@/lib/care/services";
import type {
  ApiBookingListItem,
  ApiBookingsListResponse,
} from "@/app/api/m/bookings/route";
import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";
import {
  BookingStateBadge,
  bookingStateFromStatus,
} from "@/components/m/BookingStateBadge";
import PostJobFab from "@/components/m/PostJobFab";

/**
 * Bookings list — Figma 30:392.
 * Backed by /api/m/bookings (real Supabase). Tabs filter against real
 * booking_status enum values; labels stay seeker-friendly.
 */

type TabKey = "all" | "pending" | "accepted" | "cancelled";
type Tone = "primary" | "amber" | "green" | "red" | "neutral";

const FILTERS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Requested" },
  { key: "accepted", label: "Accepted" },
  { key: "cancelled", label: "Rejected" },
];

/**
 * Tone map mirrors the original mock palette but is keyed on the real
 * booking_status enum: pending|accepted|paid|in_progress|completed|
 * paid_out|cancelled|refunded|disputed.
 */
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
  const s = new Date(startsIso);
  const e = new Date(endsIso);
  const ok = !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime());
  if (!ok) return "—";
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(s)}–${fmt(e)}`;
}

function counterpartyName(b: ApiBookingListItem): string {
  return (
    b.counterparty.display_name ??
    b.counterparty.full_name ??
    (b.as_role === "seeker" ? "Caregiver" : "Care seeker")
  );
}
function counterpartyAvatar(b: ApiBookingListItem): string | undefined {
  return (
    b.counterparty.photo_url ?? b.counterparty.avatar_url ?? undefined
  );
}
function counterpartyLocation(b: ApiBookingListItem): string {
  const country =
    b.counterparty.country?.toUpperCase() === "GB"
      ? "UK"
      : b.counterparty.country?.toUpperCase() === "US"
        ? "US"
        : b.counterparty.country ?? null;
  return [b.counterparty.city, country]
    .filter((s): s is string => Boolean(s))
    .join(", ");
}
/** "gbp"/"usd" → "GBP"/"USD" for formatMoney. */
function asCurrencyUpper(c: "gbp" | "usd"): "GBP" | "USD" {
  return c === "usd" ? "USD" : "GBP";
}

/**
 * Redesign grouping (PR-R3, flag-gated): collapse the lifecycle into three
 * seeker-meaningful sections. A booking lands in exactly one bucket; statuses
 * outside these buckets (e.g. paid_out, refunded) fold into Past so nothing is
 * dropped from the list.
 */
type SectionKey = "now" | "upcoming" | "past";
const SECTION_ORDER: { key: SectionKey; label: string }[] = [
  { key: "now", label: "Now" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

function sectionForStatus(status: string): SectionKey {
  if (status === "in_progress") return "now";
  if (status === "accepted" || status === "paid" || status === "pending")
    return "upcoming";
  return "past";
}

/**
 * One booking card. Shared by the flag-off flat list and the flag-on grouped
 * sections. The status pill differs by mode: flag-off keeps the existing
 * tone-mapped <Tag> (incl. timesheet-precedence labels); flag-on uses the
 * redesigned <BookingStateBadge> when the status maps to a lifecycle state,
 * falling back to the <Tag> for timesheet/edge states.
 */
function BookingCardRow({
  b,
  unread,
  redesign,
}: {
  b: ApiBookingListItem;
  unread: boolean;
  redesign: boolean;
}) {
  const name = counterpartyName(b);
  const avatar = counterpartyAvatar(b);
  const location = counterpartyLocation(b);

  // Timesheet state takes precedence on completed bookings — the booking sits
  // at status='completed' until the seeker confirms or the cron auto-approves;
  // the pill should reflect that the user can still act, not just "Completed".
  let tone: Tone = STATUS_TONE[b.status] ?? "neutral";
  let statusLabel: string = STATUS_LABEL[b.status] ?? b.status;
  let timesheetOverride = false;
  if (b.timesheet_status === "pending_approval") {
    tone = "amber";
    statusLabel =
      b.as_role === "seeker" ? "Timesheet pending" : "Awaiting approval";
    timesheetOverride = true;
  } else if (b.timesheet_status === "disputed") {
    tone = "red";
    statusLabel = "Disputed — under review";
    timesheetOverride = true;
  } else if (
    b.timesheet_status === "approved" ||
    b.timesheet_status === "auto_approved"
  ) {
    tone = "green";
    statusLabel =
      b.timesheet_status === "auto_approved" ? "Auto-approved" : "Approved";
    timesheetOverride = true;
  }

  // Flag-on: prefer the lifecycle badge, but defer to the <Tag> for timesheet
  // overrides and statuses that don't map to a lifecycle state.
  const lifecycleState = bookingStateFromStatus(b.status);
  const badge =
    redesign && lifecycleState && !timesheetOverride ? (
      <BookingStateBadge state={lifecycleState} size="sm" />
    ) : (
      <Tag tone={tone}>{statusLabel}</Tag>
    );

  return (
    <Link href={`/m/bookings/${b.id}`} className="block">
      <Card>
        <div className="flex items-start gap-3">
          <Avatar src={avatar} name={name} size={56} />
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-heading truncate flex items-center gap-2">
              <span className="truncate">{name}</span>
              {unread && (
                <span
                  aria-label="Unread messages"
                  className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                  style={{ background: "#039EA0" }}
                />
              )}
            </p>
            {b.service_type && (
              <div className="mt-1.5">
                <Tag tone="primary">{serviceLabel(b.service_type)}</Tag>
              </div>
            )}
          </div>
          {badge}
        </div>

        <ul className="mt-4 space-y-2 text-[13px] text-heading">
          {location && (
            <li className="flex items-center gap-2">
              <span className="text-subheading">
                <IconPin />
              </span>
              {location}
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className="text-subheading">
              <IconCal />
            </span>
            {fmtDateLong(b.starts_at)}
            {b.starts_at && b.ends_at && (
              <span className="text-subheading">
                {" "}
                · {fmtTimeRange(b.starts_at, b.ends_at)}
              </span>
            )}
          </li>
          {b.total_cents > 0 && (
            <li className="flex items-center gap-2 text-subheading">
              Total:{" "}
              <span className="font-bold text-heading">
                {formatMoney(b.total_cents, asCurrencyUpper(b.currency))}
              </span>
            </li>
          )}
        </ul>

        <div className="border-t border-line mt-4 pt-3 flex items-center justify-end gap-2">
          <span className="h-10 w-10 rounded-btn bg-primary-50 text-primary grid place-items-center">
            <IconPhone />
          </span>
          <span className="h-10 w-10 rounded-btn bg-primary-50 text-primary grid place-items-center">
            <IconMail />
          </span>
          <span className="h-10 w-10 rounded-btn bg-primary-50 text-primary grid place-items-center">
            <IconChatBubble />
          </span>
        </div>
      </Card>
    </Link>
  );
}

export default function BookingsPage() {
  const redesign = isMobileRedesignEnabled();
  const [filter, setFilter] = useState<TabKey>("all");
  const [bookings, setBookings] = useState<ApiBookingListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [unread, setUnread] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/bookings", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setBookings([]);
          if (res.status !== 401) setErr("Could not load bookings.");
          return;
        }
        const json = (await res.json()) as ApiBookingsListResponse;
        if (cancelled) return;
        const list = json.bookings ?? [];
        setBookings(list);
        const ids = list.map((b) => b.id);
        if (ids.length > 0) {
          try {
            const r2 = await fetch("/api/m/chat/unread", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bookingIds: ids }),
            });
            if (!cancelled && r2.ok) {
              const j2 = (await r2.json()) as { unreadBookingIds: string[] };
              setUnread(new Set(j2.unreadBookingIds ?? []));
            }
          } catch {
            /* best-effort */
          }
        }
      } catch {
        if (!cancelled) {
          setBookings([]);
          setErr("Could not load bookings.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    if (!bookings) return [];
    if (filter === "all") return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar
        back="/m/home"
        title="Bookings"
        right={
          <>
            <NotificationBell />
            <button
              aria-label="Filter"
              className="h-10 w-10 rounded-btn bg-primary text-white grid place-items-center sc-no-select"
            >
              <IconFilter />
            </button>
          </>
        }
      />

      {/* Filter tabs (horizontal scroll) */}
      <div className="bg-white border-b border-line">
        <div className="-mx-2 px-2 flex gap-1 overflow-x-auto sc-no-select">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-5 py-3 text-[14px] font-semibold relative ${
                  active ? "text-primary" : "text-subheading"
                }`}
              >
                {f.label}
                {active && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-px h-0.5 w-12 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* Loading skeleton */}
        {bookings === null && (
          <>
            <BookingCardSkeleton />
            <BookingCardSkeleton />
            <BookingCardSkeleton />
          </>
        )}

        {/* Real cards. Flag on: grouped Now/Upcoming/Past sections, each row
            carrying a <BookingStateBadge>. Flag off: the original flat list. */}
        {bookings !== null &&
          !redesign &&
          items.map((b) => (
            <BookingCardRow
              key={b.id}
              b={b}
              unread={unread.has(b.id)}
              redesign={false}
            />
          ))}

        {bookings !== null &&
          redesign &&
          SECTION_ORDER.map(({ key, label }) => {
            const rows = items.filter((b) => sectionForStatus(b.status) === key);
            if (rows.length === 0) return null;
            return (
              <section key={key} className="space-y-4">
                <h2 className="text-[13px] font-bold uppercase tracking-wide text-subheading">
                  {label}
                </h2>
                {rows.map((b) => (
                  <BookingCardRow
                    key={b.id}
                    b={b}
                    unread={unread.has(b.id)}
                    redesign
                  />
                ))}
              </section>
            );
          })}

        {/* Error pill — only when the network failed (auth missing is silent) */}
        {bookings !== null && err && (
          <p
            aria-live="polite"
            className="text-[13px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2"
          >
            {err}
          </p>
        )}

        {/* Empty state */}
        {bookings !== null && bookings.length === 0 && !err && (
          <Card className="text-center py-10">
            <p className="text-heading font-semibold">No bookings yet</p>
            <p className="mt-2 text-[13px] text-subheading">
              Find a caregiver and create your first booking.
            </p>
            <Link
              href="/m/home"
              className="mt-4 inline-block text-primary font-bold"
            >
              Find a caregiver
            </Link>
          </Card>
        )}

        {/* Tab-empty (data present but filter excludes all) */}
        {bookings !== null && bookings.length > 0 && items.length === 0 && (
          <Card className="text-center py-8">
            <p className="text-heading font-semibold">
              No {filter === "all" ? "" : (FILTERS.find((f) => f.key === filter)?.label.toLowerCase() ?? "")}{" "}
              bookings
            </p>
            <p className="mt-2 text-[13px] text-subheading">
              Try a different filter.
            </p>
          </Card>
        )}
      </div>

      {/* Post Job moves from a bottom tab to this peach FAB when the redesign
          is on. /m/post-job still exists as the destination. */}
      {redesign && <PostJobFab />}

      <BottomNav active="bookings" role="seeker" />
    </main>
  );
}

function BookingCardSkeleton() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Avatar,
  Button,
  IconBag,
  IconChat,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconPin,
  Tag,
  TopBar,
} from "../_components/ui";
import { serviceLabel } from "@/lib/care/services";
import { formatMoney } from "@/lib/care/services";
import type { MyWorkBooking, WorkTab } from "@/app/api/m/my-work/route";
import type { WorkStatusCounts } from "@/app/api/m/work-status/route";

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */

interface MyWorkClientProps {
  /** Called when the user taps "Find work" from an empty inbox state */
  onFindWork: () => void;
}

/* ──────────────────────────────────────────────────────────────────
   Date helpers (no date-fns — use Intl)
   ────────────────────────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateRange(startsAt: string, endsAt: string, hours: number): string {
  return `${fmtDate(startsAt)} · ${fmtTime(startsAt)}–${fmtTime(endsAt)} (${hours}h)`;
}

function fmtExpiry(expiresAt: string | null): { label: string; urgency: "normal" | "amber" | "red" } | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return { label: "Expired", urgency: "red" };
  const totalMins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const label =
    hours > 0 ? `Expires in ${hours}h ${mins}m` : `Expires in ${mins}m`;
  const urgency = diffMs < 60 * 60_000 ? "red" : diffMs < 24 * 60 * 60_000 ? "amber" : "normal";
  return { label, urgency };
}

/* ──────────────────────────────────────────────────────────────────
   Status pill colours
   ────────────────────────────────────────────────────────────────── */
function statusPillClass(status: string): string {
  switch (status) {
    case "offered":
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "accepted":
    case "paid":
      return "bg-emerald-50 text-emerald-700";
    case "in_progress":
      return "bg-teal-50 text-[#0E7C7B]";
    case "completed":
    case "paid_out":
      return "bg-sky-50 text-sky-700";
    case "cancelled":
    case "declined":
      return "bg-zinc-100 text-zinc-500";
    default:
      return "bg-muted text-subheading";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "offered": return "Offer";
    case "pending": return "Requested";
    case "accepted": return "Accepted";
    case "paid": return "Confirmed";
    case "in_progress": return "In progress";
    case "completed": return "Completed";
    case "paid_out": return "Paid out";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

/* ──────────────────────────────────────────────────────────────────
   BookingCard
   ────────────────────────────────────────────────────────────────── */
interface BookingCardProps {
  booking: MyWorkBooking;
  tab: WorkTab;
  onAction?: (id: string, action: "accept" | "decline") => void;
}

function BookingCard({ booking, tab, onAction }: BookingCardProps) {
  const expiry = fmtExpiry(booking.offer_expires_at);
  const amount = formatMoney(booking.hourly_rate_cents * booking.hours, (booking.currency?.toUpperCase() as "GBP" | "USD") ?? "GBP");
  const location = booking.location_city ?? booking.location_postcode ?? "Location TBC";
  const detailHref = `/m/bookings/${booking.id}`;
  const activeJobHref = `/m/active-job/${booking.id}`;
  const chatHref = `/m/chat`;

  const cardInner = (
    <div className="rounded-card bg-white border border-line p-4 space-y-3 active:bg-muted/40 transition-colors">
      {/* Top row: status pill + amount */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-pill text-[12px] font-semibold ${statusPillClass(booking.status)}`}>
          {statusLabel(booking.status)}
        </span>
        <span className="text-[16px] font-bold text-heading">{amount}</span>
      </div>

      {/* Expiry countdown (inbox only) */}
      {expiry && tab === "inbox" && (
        <p className={`text-[12px] font-semibold ${
          expiry.urgency === "red" ? "text-red-600" :
          expiry.urgency === "amber" ? "text-amber-600" :
          "text-subheading"
        }`}>
          <IconClock />
          {" "}{expiry.label}
        </p>
      )}

      {/* Title */}
      <p className="text-[15px] font-bold text-heading leading-tight">
        {booking.seeker_first_name}
        {booking.organization_name ? ` · ${booking.organization_name}` : ` · ${serviceLabel(booking.service_type)}`}
      </p>

      {/* Date */}
      <p className="flex items-center gap-1.5 text-[13px] text-subheading">
        <IconClock />
        {fmtDateRange(booking.starts_at, booking.ends_at, booking.hours)}
      </p>

      {/* Location */}
      <p className="flex items-center gap-1.5 text-[13px] text-subheading">
        <IconPin />
        {location}
      </p>

      {/* Footer actions */}
      {tab === "inbox" && (
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.preventDefault();
              onAction?.(booking.id, "decline");
            }}
          >
            Decline
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.preventDefault();
              onAction?.(booking.id, "accept");
            }}
          >
            Accept
          </Button>
        </div>
      )}

      {(tab === "applied" || tab === "upcoming") && (
        <Link
          href={chatHref}
          className="flex items-center justify-center gap-2 h-10 rounded-btn bg-primary-50 text-primary text-[14px] font-semibold active:bg-primary-100"
          onClick={(e) => e.stopPropagation()}
        >
          <IconChat />
          Open chat
        </Link>
      )}

      {tab === "in_progress" && (
        <div className="flex gap-2 pt-1">
          <Link
            href={chatHref}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-btn bg-primary-50 text-primary text-[14px] font-semibold active:bg-primary-100"
            onClick={(e) => e.stopPropagation()}
          >
            <IconChat />
            Chat
          </Link>
          <Link
            href={activeJobHref}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-btn bg-primary text-white text-[14px] font-semibold active:bg-primary-600"
            onClick={(e) => e.stopPropagation()}
          >
            <IconCheck />
            Active shift
          </Link>
        </div>
      )}

      {tab === "completed" && (
        <Link
          href={detailHref}
          className="flex items-center justify-between h-10 px-1 text-[14px] font-semibold text-primary active:text-primary-600"
          onClick={(e) => e.stopPropagation()}
        >
          View details
          <IconChevronRight />
        </Link>
      )}
    </div>
  );

  // Whole card tappable to booking detail
  if (tab !== "inbox") {
    return (
      <Link href={detailHref} className="block">
        {cardInner}
      </Link>
    );
  }

  // Inbox: card is non-navigable wrapper (actions handle interaction)
  return <div>{cardInner}</div>;
}

/* ──────────────────────────────────────────────────────────────────
   Sub-tab bar
   ────────────────────────────────────────────────────────────────── */
const ALL_TABS: { key: WorkTab; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "applied", label: "Applied" },
  { key: "upcoming", label: "Upcoming" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
];

interface SubTabBarProps {
  active: WorkTab;
  counts: WorkStatusCounts | null;
  onSelect: (tab: WorkTab) => void;
}

function SubTabBar({ active, counts, onSelect }: SubTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleTabs = ALL_TABS.filter(
    (t) => t.key !== "applied" || (counts?.applied ?? 0) > 0,
  );

  return (
    <div
      ref={scrollRef}
      className="flex overflow-x-auto gap-1 px-5 py-2 scrollbar-hide border-b border-line"
      style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
    >
      {visibleTabs.map(({ key, label }) => {
        const count = counts ? counts[key] : 0;
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`sc-no-select flex-shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-pill text-[13px] font-semibold transition-colors ${
              isActive
                ? "bg-primary text-white"
                : "bg-muted text-subheading"
            }`}
          >
            {label}
            {count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[11px] font-bold ${
                  isActive
                    ? "bg-white/30 text-white"
                    : key === "inbox"
                    ? "bg-amber-500 text-white"
                    : "bg-primary/15 text-primary"
                }`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Empty states
   ────────────────────────────────────────────────────────────────── */
function EmptyState({ tab, onFindWork }: { tab: WorkTab; onFindWork: () => void }) {
  if (tab === "inbox") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
        <span className="text-4xl">📭</span>
        <p className="text-[15px] text-heading font-semibold">No new offers right now</p>
        <p className="text-[13px] text-subheading leading-relaxed">
          Set your availability and find work to attract more bookings.
        </p>
        <Button variant="primary" size="md" onClick={onFindWork}>
          Find work
        </Button>
      </div>
    );
  }
  const msgs: Partial<Record<WorkTab, string>> = {
    upcoming: "Nothing scheduled yet.",
    in_progress: "No active shifts right now.",
    completed: "No completed shifts yet.",
    declined: "Nothing here.",
    applied: "No pending applications.",
  };
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-2">
      <IconBag />
      <p className="text-[14px] text-subheading mt-2">{msgs[tab] ?? "Nothing here."}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   MyWorkClient — main component
   ────────────────────────────────────────────────────────────────── */
export default function MyWorkClient({ onFindWork }: MyWorkClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const paramTab = searchParams.get("tab") as WorkTab | null;
  const validTabs: WorkTab[] = ["inbox", "applied", "upcoming", "in_progress", "completed", "declined"];
  const [activeTab, setActiveTab] = useState<WorkTab>(
    paramTab && validTabs.includes(paramTab) ? paramTab : "inbox",
  );

  const [counts, setCounts] = useState<WorkStatusCounts | null>(null);
  const [bookings, setBookings] = useState<MyWorkBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);

  // Fetch counts on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/work-status");
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { counts: WorkStatusCounts };
          setCounts(data.counts);
        }
      } catch {
        /* best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch bookings for active tab
  const fetchBookings = useCallback(async (tab: WorkTab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/m/my-work?tab=${tab}`);
      if (res.ok) {
        const data = (await res.json()) as { bookings: MyWorkBooking[] };
        setBookings(data.bookings);
      } else {
        setBookings([]);
      }
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings(activeTab);
  }, [activeTab, fetchBookings]);

  const handleSelectTab = useCallback(
    (tab: WorkTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`/m/jobs?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleAction = useCallback(
    async (id: string, action: "accept" | "decline") => {
      if (actionPending) return;
      setActionPending(id);
      try {
        // Real handler is POST /api/bookings/[id]/action which supports
        // both accept and decline (and forbids cross-role usage server-side).
        const res = await fetch(`/api/bookings/${id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          // Optimistically remove from inbox list + update counts
          setBookings((prev) => prev.filter((b) => b.id !== id));
          setCounts((prev) =>
            prev
              ? {
                  ...prev,
                  inbox: Math.max(0, prev.inbox - 1),
                  ...(action === "accept" ? { upcoming: prev.upcoming + 1 } : {}),
                }
              : prev,
          );
        }
      } catch {
        /* best-effort */
      } finally {
        setActionPending(null);
      }
    },
    [actionPending],
  );

  return (
    <div className="flex flex-col">
      {/* TopBar — no back button, just title */}
      <TopBar title="My work" />

      {/* Sub-tab bar */}
      <SubTabBar
        active={activeTab}
        counts={counts}
        onSelect={handleSelectTab}
      />

      {/* Content */}
      <div className="px-4 py-4 space-y-3">
        {loading ? (
          <SkeletonList />
        ) : bookings.length === 0 ? (
          <EmptyState tab={activeTab} onFindWork={onFindWork} />
        ) : (
          bookings.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              tab={activeTab}
              onAction={handleAction}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Skeleton loader
   ────────────────────────────────────────────────────────────────── */
function SkeletonList() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-card bg-white border border-line p-4 space-y-3 animate-pulse">
          <div className="flex justify-between">
            <div className="h-6 w-20 bg-muted rounded-pill" />
            <div className="h-6 w-16 bg-muted rounded-pill" />
          </div>
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="h-3 w-40 bg-muted rounded" />
          <div className="h-3 w-32 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

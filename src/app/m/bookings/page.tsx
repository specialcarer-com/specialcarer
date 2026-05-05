"use client";

import Link from "next/link";
import { useState } from "react";
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
import {
  BOOKINGS,
  STATUS_TONE,
  getCarer,
  type BookingStatus,
} from "../_lib/mock";

/**
 * Bookings list — Figma 30:392.
 * Tabs (All / Requested / Accepted / Rejected) with the same booking
 * card layout as on Home.
 */

const FILTERS: { key: "All" | BookingStatus; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Requested", label: "Requested" },
  { key: "Accepted", label: "Accepted" },
  { key: "Rejected", label: "Rejected" },
];

export default function BookingsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("All");

  const items = BOOKINGS.filter(
    (b) => filter === "All" || b.status === filter
  );

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
        {items.map((b) => {
          const carer = getCarer(b.carerId);
          if (!carer) return null;
          return (
            <Link key={b.id} href={`/m/bookings/${b.id}`} className="block">
              <Card>
                <div className="flex items-start gap-3">
                  <Avatar src={carer.photo} name={carer.name} size={56} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-bold text-heading truncate">
                      {carer.name}
                    </p>
                    <div className="mt-1.5">
                      <Tag tone="primary">{b.service}</Tag>
                    </div>
                  </div>
                  <Tag tone={STATUS_TONE[b.status]}>{b.status}</Tag>
                </div>

                <ul className="mt-4 space-y-2 text-[13px] text-heading">
                  <li className="flex items-center gap-2">
                    <span className="text-subheading"><IconPin /></span>
                    {b.address}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-subheading"><IconCal /></span>
                    Slot — {b.slot}
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-subheading"><IconCal /></span>
                    {b.date} | {b.time}
                  </li>
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
        })}

        {items.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-heading font-semibold">No bookings yet</p>
            <p className="mt-2 text-[13px] text-subheading">
              Find a carer and create your first booking.
            </p>
            <Link
              href="/m/search"
              className="mt-4 inline-block text-primary font-bold"
            >
              Browse carers
            </Link>
          </Card>
        )}
      </div>

      <BottomNav active="bookings" role="seeker" />
    </main>
  );
}

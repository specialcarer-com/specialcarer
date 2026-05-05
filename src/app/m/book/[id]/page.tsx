"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  IconCal,
  IconStar,
  Input,
  TextArea,
  TopBar,
} from "../../_components/ui";
import { SERVICE_LABEL, getCarer } from "../../_lib/mock";

/**
 * Create Booking — Figma 46:2379.
 * Combines: profile header, service chips, date picker, slot picker,
 * notes, then route → /m/book/[id]/checkout for Stripe payment.
 *
 * The calendar is intentionally simple (built from JS Date math, not a
 * heavy library) — this keeps the bundle small inside the WebView.
 */

const SLOT_OPTIONS = [
  "10:00 AM - 12:00 PM",
  "2:00 PM - 6:00 PM",
  "9:00 AM - 12:00 PM",
];

export default function CreateBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const carer = getCarer(params.id);

  const [service, setService] = useState<string>(carer?.services[0] ?? "child");
  const [monthOffset, setMonthOffset] = useState(0);
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const month = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  if (!carer) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/search" title="Create Booking" />
        <p className="px-6 mt-10 text-center text-heading">Carer not found.</p>
      </main>
    );
  }

  const onContinue = () => {
    if (!date || !slot || !address) return;
    const params = new URLSearchParams({
      service,
      date: date.toISOString(),
      slot,
      from,
      to,
      address,
      notes,
    });
    router.push(`/m/book/${carer.id}/checkout?${params.toString()}`);
  };

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back={`/m/carer/${carer.id}`} title="Create Booking" />

      {/* Carer header */}
      <div className="bg-white px-6 pt-2 pb-6 flex flex-col items-center text-center border-b border-line">
        <Avatar src={carer.photo} name={carer.name} size={88} />
        <p className="mt-3 text-[18px] font-bold text-heading">{carer.name}</p>
        <p className="text-[12px] text-subheading">{carer.city}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-heading font-semibold">
          <IconStar /> {carer.rating.toFixed(1)} · {carer.experienceYears}+ years
        </p>
      </div>

      <div className="px-4 pt-4 space-y-5">
        <h2 className="text-[14px] font-bold text-heading px-1">Professional</h2>
        <div className="rounded-btn border border-line bg-white px-4 h-12 flex items-center text-heading text-[14px]">
          {carer.name}
        </div>

        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Select Categories</h2>
          <div className="flex flex-wrap gap-2">
            {carer.services.map((s) => {
              const active = service === s;
              return (
                <button
                  key={s}
                  onClick={() => setService(s)}
                  className={`h-12 px-4 rounded-btn border text-[14px] font-semibold transition flex items-center gap-2 ${
                    active
                      ? "border-primary text-primary bg-white"
                      : "border-line text-heading bg-white"
                  }`}
                >
                  {SERVICE_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date picker */}
        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Date</h2>
          <Calendar
            month={month}
            value={date}
            onChange={setDate}
            onPrev={() => setMonthOffset((m) => m - 1)}
            onNext={() => setMonthOffset((m) => m + 1)}
          />
        </div>

        {/* Slots */}
        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Slots</h2>
          <div className="rounded-btn bg-white border border-line overflow-hidden">
            {SLOT_OPTIONS.map((s, i) => {
              const active = slot === s;
              return (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  className={`w-full text-left px-4 h-12 text-[14px] flex items-center justify-between ${
                    i !== 0 ? "border-t border-line" : ""
                  } ${active ? "bg-primary-50 text-primary font-bold" : "text-heading"}`}
                >
                  {s}
                  {active && <IconCal />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hours */}
        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Booking Hours</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="From"
              type="time"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              label="To"
              type="time"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <Input
          label="Address"
          placeholder="Where should the carer come?"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <TextArea
          label="Notes for the carer (optional)"
          placeholder="Anything specific they should know — allergies, routine, access instructions…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom">
        <Button
          block
          disabled={!date || !slot || !address}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Calendar — minimal, design-system styled
   ────────────────────────────────────────────────────────────────── */

function Calendar({
  month,
  value,
  onChange,
  onPrev,
  onNext,
}: {
  month: Date;
  value: Date | null;
  onChange: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const monthName = month.toLocaleString("default", { month: "long" });
  const year = month.getFullYear();
  const firstWeekday = (month.getDay() + 6) % 7; // Mon-first index
  const daysInMonth = new Date(year, month.getMonth() + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <div className="rounded-card border border-line bg-white p-3">
      <div className="flex items-center justify-between px-2">
        <button onClick={onPrev} aria-label="Previous month" className="p-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className="text-center">
          <p className="text-[16px] font-bold text-heading">{monthName}</p>
          <p className="text-[11px] text-subheading">{year}</p>
        </div>
        <button onClick={onNext} aria-label="Next month" className="p-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mt-2 px-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
          <span
            key={d}
            className={`text-center text-[11px] font-semibold py-2 ${
              i >= 5 ? "text-[#E55]" : "text-subheading"
            }`}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 px-1 pb-1">
        {cells.map((cell, i) => {
          if (cell === null) return <span key={i} />;
          const cellDate = new Date(year, month.getMonth(), cell);
          const isToday =
            new Date().toDateString() === cellDate.toDateString();
          const isSelected =
            value && value.toDateString() === cellDate.toDateString();
          const isWeekend = i % 7 >= 5;
          return (
            <button
              key={i}
              onClick={() => onChange(cellDate)}
              className={`aspect-square grid place-items-center text-[14px] rounded-full transition ${
                isSelected
                  ? "bg-primary text-white font-bold"
                  : isWeekend
                  ? "text-[#E55]"
                  : "text-heading"
              } ${isToday && !isSelected ? "ring-1 ring-primary" : ""}`}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}

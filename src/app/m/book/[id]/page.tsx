"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Avatar,
  Button,
  CarerBadges,
  IconCal,
  IconStar,
  Input,
  TextArea,
  TopBar,
} from "../../_components/ui";
import {
  CARE_FORMAT_BLURB,
  CARE_FORMAT_LABEL,
  type CareFormat,
  SERVICE_LABEL,
  getCarer,
} from "../../_lib/mock";

/**
 * Create Booking — Figma 46:2379, extended for live-in.
 *
 * The page now opens with a "Type of care" segmented control. The rest
 * of the form is conditional on that choice:
 *
 *   • Visiting → calendar single-date + slot + From/To hours (hourly bill).
 *   • Live-in  → calendar start-date + end-date (weekly bill).
 *
 * The calendar component is reused — for live-in we render two side-by-side.
 * Both branches push to the same checkout route with disambiguating query
 * params; the checkout page reads `careType` to switch between hourly /
 * weekly summary maths.
 */

const SLOT_OPTIONS = [
  "10:00 AM - 12:00 PM",
  "2:00 PM - 6:00 PM",
  "9:00 AM - 12:00 PM",
];

function fmtDateShort(d: Date) {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CreateBookingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const carer = getCarer(params.id);

  // Default to whichever format the carer offers first; falls back to visiting.
  const offered: CareFormat[] = carer?.careFormats?.length
    ? carer.careFormats
    : ["visiting"];
  const [careType, setCareType] = useState<CareFormat>(offered[0]);

  const [service, setService] = useState<string>(carer?.services[0] ?? "child");

  // Visiting state
  const [monthOffset, setMonthOffset] = useState(0);
  const [date, setDate] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Live-in state — uses its own month nav so the user can scroll independently
  const [liMonthOffset, setLiMonthOffset] = useState(0);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const month = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const liMonth = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + liMonthOffset, 1);
  }, [liMonthOffset]);

  if (!carer) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/search" title="Create Booking" />
        <p className="px-6 mt-10 text-center text-heading">Carer not found.</p>
      </main>
    );
  }

  // Validity differs per branch.
  const visitingValid = !!(date && slot && address);
  const liveInValid = !!(
    startDate &&
    endDate &&
    endDate.getTime() > startDate.getTime() &&
    address
  );
  const canContinue = careType === "visiting" ? visitingValid : liveInValid;

  // Number of weeks (rounded up) for the live-in summary preview.
  const weeks = useMemo(() => {
    if (careType !== "live_in" || !startDate || !endDate) return 0;
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(1, Math.ceil(days / 7));
  }, [careType, startDate, endDate]);

  const onContinue = () => {
    if (!canContinue) return;
    const qp = new URLSearchParams({
      careType,
      service,
      address,
      notes,
    });
    if (careType === "visiting" && date && slot) {
      qp.set("date", date.toISOString());
      qp.set("slot", slot);
      qp.set("from", from);
      qp.set("to", to);
    } else if (careType === "live_in" && startDate && endDate) {
      qp.set("date", startDate.toISOString());
      qp.set("endDate", endDate.toISOString());
    }
    router.push(`/m/book/${carer.id}/checkout?${qp.toString()}`);
  };

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back={`/m/carer/${carer.id}`} title="Create Booking" />

      {/* Carer header */}
      <div className="bg-white px-6 pt-2 pb-6 flex flex-col items-center text-center border-b border-line">
        <Avatar src={carer.photo} name={carer.name} size={88} />
        <p className="mt-3 text-[18px] font-bold text-heading">{carer.name}</p>
        <p className="text-[12px] text-subheading">{carer.city}</p>
        {(carer.isClinical || carer.isNurse) && (
          <div className="mt-1.5">
            <CarerBadges
              isClinical={carer.isClinical}
              isNurse={carer.isNurse}
            />
          </div>
        )}
        <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-heading font-semibold">
          <IconStar /> {carer.rating.toFixed(1)} · {carer.experienceYears}+ years
        </p>
      </div>

      <div className="px-4 pt-4 space-y-5">
        {/* Type of care — segmented control */}
        <div>
          <h2 className="text-[14px] font-bold text-heading mb-2">Type of care</h2>
          <div
            role="tablist"
            aria-label="Type of care"
            className="grid grid-cols-2 gap-2 p-1 rounded-btn bg-muted"
          >
            {(["visiting", "live_in"] as const).map((t) => {
              const enabled = offered.includes(t);
              const active = careType === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={active}
                  disabled={!enabled}
                  onClick={() => setCareType(t)}
                  className={`h-11 rounded-btn text-[13px] font-semibold transition ${
                    active
                      ? "bg-white text-primary shadow-sm"
                      : enabled
                      ? "text-heading"
                      : "text-subheading opacity-40"
                  }`}
                >
                  {CARE_FORMAT_LABEL[t]}
                  {!enabled && (
                    <span className="block text-[10px] font-normal">
                      not offered
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-subheading leading-snug px-1">
            {CARE_FORMAT_BLURB[careType]}
          </p>
        </div>

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

        {careType === "visiting" ? (
          <>
            {/* Visiting — single date + slot + hours */}
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
          </>
        ) : (
          <>
            {/* Live-in — start + end date pickers */}
            <div>
              <h2 className="text-[14px] font-bold text-heading mb-2">
                Placement dates
              </h2>
              <Calendar
                month={liMonth}
                value={null}
                rangeStart={startDate}
                rangeEnd={endDate}
                onChange={(d) => {
                  // First click sets start; second sets end; clicking again resets.
                  if (!startDate || (startDate && endDate)) {
                    setStartDate(d);
                    setEndDate(null);
                  } else if (d.getTime() <= startDate.getTime()) {
                    setStartDate(d);
                    setEndDate(null);
                  } else {
                    setEndDate(d);
                  }
                }}
                onPrev={() => setLiMonthOffset((m) => m - 1)}
                onNext={() => setLiMonthOffset((m) => m + 1)}
              />
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-btn border border-line bg-white px-3 py-2">
                  <p className="text-[11px] text-subheading">Start</p>
                  <p className="text-[14px] font-semibold text-heading">
                    {startDate ? fmtDateShort(startDate) : "Select"}
                  </p>
                </div>
                <div className="rounded-btn border border-line bg-white px-3 py-2">
                  <p className="text-[11px] text-subheading">End</p>
                  <p className="text-[14px] font-semibold text-heading">
                    {endDate ? fmtDateShort(endDate) : "Select"}
                  </p>
                </div>
              </div>
              {weeks > 0 && (
                <p className="mt-2 text-[12px] text-subheading px-1">
                  {weeks} week{weeks === 1 ? "" : "s"} · billed weekly
                </p>
              )}
            </div>
          </>
        )}

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
        <Button block disabled={!canContinue} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Calendar — minimal, design-system styled.

   Two modes:
     • Single-date: pass `value`, omit range props.
     • Range: pass `rangeStart` / `rangeEnd`; the parent decides how
       clicks map to start vs end (see live-in branch above).
   ────────────────────────────────────────────────────────────────── */

function Calendar({
  month,
  value,
  rangeStart,
  rangeEnd,
  onChange,
  onPrev,
  onNext,
}: {
  month: Date;
  value: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
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

  const isInRange = (d: Date) => {
    if (!rangeStart || !rangeEnd) return false;
    const t = d.getTime();
    return t > rangeStart.getTime() && t < rangeEnd.getTime();
  };
  const isRangeEdge = (d: Date) => {
    const t = d.getTime();
    return (
      (rangeStart && t === rangeStart.getTime()) ||
      (rangeEnd && t === rangeEnd.getTime())
    );
  };

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
          const isToday = new Date().toDateString() === cellDate.toDateString();
          const isSelected =
            value && value.toDateString() === cellDate.toDateString();
          const inRange = isInRange(cellDate);
          const edge = isRangeEdge(cellDate);
          const isWeekend = i % 7 >= 5;
          return (
            <button
              key={i}
              onClick={() => onChange(cellDate)}
              className={`aspect-square grid place-items-center text-[14px] rounded-full transition ${
                isSelected || edge
                  ? "bg-primary text-white font-bold"
                  : inRange
                  ? "bg-primary-50 text-primary"
                  : isWeekend
                  ? "text-[#E55]"
                  : "text-heading"
              } ${isToday && !isSelected && !edge ? "ring-1 ring-primary" : ""}`}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  TopBar,
  BottomNav,
  SectionTitle,
  Button,
  IconPlus,
  IconTrash,
  IconClock,
  IconCal,
  IconUser,
  IconCheck,
} from "../_components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

type Blockout = {
  id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
};

type TimeoffRequest = {
  id: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  status: "pending" | "approved" | "declined" | "cancelled";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type RecurringClient = {
  client_id: string;
  client_type: "org" | "private";
  display_name: string | null;
  next_visit: string | null;
  visit_count: number;
  next_4_visits: string[];
  series_id: string | null;
};

type AvailabilitySlot = {
  weekday: number;
  start_time: string;
  end_time: string;
};

// ── Time/date helpers ─────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateShort(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function fmtVisit(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function to12h(t: string): string {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const STATUS_LABEL: Record<TimeoffRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<TimeoffRequest["status"], string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

// ── Today's weekdays ──────────────────────────────────────────────────────────
function getTodayWeekday(): number {
  return new Date().getDay();
}

// ── Page component ────────────────────────────────────────────────────────────

export default function SchedulePage() {
  // availability summary (for "this week" section)
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);

  // blockouts
  const [blockouts, setBlockouts] = useState<Blockout[]>([]);
  const [blockoutForm, setBlockoutForm] = useState({
    starts_on: "",
    ends_on: "",
    reason: "",
  });
  const [blockoutAdding, setBlockoutAdding] = useState(false);
  const [blockoutOpen, setBlockoutOpen] = useState(false);

  // recurring clients
  const [clients, setClients] = useState<RecurringClient[]>([]);

  // time off
  const [timeoffs, setTimeoffs] = useState<TimeoffRequest[]>([]);
  const [timeoffForm, setTimeoffForm] = useState({
    starts_on: "",
    ends_on: "",
    reason: "",
  });
  const [timeoffAdding, setTimeoffAdding] = useState(false);
  const [timeoffOpen, setTimeoffOpen] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Load all data ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [slotsRes, blockoutsRes, clientsRes, timeoffRes] = await Promise.all([
        fetch("/api/m/availability"),
        fetch("/api/m/blockouts"),
        fetch("/api/m/recurring-clients"),
        fetch("/api/m/timeoff"),
      ]);
      if (slotsRes.ok) {
        const { slots: s } = await slotsRes.json();
        setSlots(s ?? []);
      }
      if (blockoutsRes.ok) {
        const { blockouts: b } = await blockoutsRes.json();
        setBlockouts(b ?? []);
      }
      if (clientsRes.ok) {
        const { clients: c } = await clientsRes.json();
        setClients(c ?? []);
      }
      if (timeoffRes.ok) {
        const { requests: r } = await timeoffRes.json();
        setTimeoffs(r ?? []);
      }
    } catch {
      setLoadError("Failed to load schedule data");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Block-out: add ────────────────────────────────────────────────────────
  async function handleAddBlockout() {
    if (!blockoutForm.starts_on || !blockoutForm.ends_on) return;
    setBlockoutAdding(true);
    try {
      const res = await fetch("/api/m/blockouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blockoutForm),
      });
      if (!res.ok) {
        const j = await res.json();
        setLoadError(j.error ?? "Failed to add block-out");
        return;
      }
      const { blockout } = await res.json();
      setBlockouts((b) =>
        [...b, blockout].sort((a, z) => a.starts_on.localeCompare(z.starts_on))
      );
      setBlockoutForm({ starts_on: "", ends_on: "", reason: "" });
      setBlockoutOpen(false);
    } finally {
      setBlockoutAdding(false);
    }
  }

  // ── Block-out: delete ─────────────────────────────────────────────────────
  async function handleDeleteBlockout(id: string) {
    setBlockouts((b) => b.filter((x) => x.id !== id)); // optimistic
    const res = await fetch(`/api/m/blockouts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setLoadError("Failed to delete block-out");
      await loadAll(); // revert
    }
  }

  // ── Time-off: add ─────────────────────────────────────────────────────────
  async function handleAddTimeoff() {
    if (!timeoffForm.starts_on || !timeoffForm.ends_on || !timeoffForm.reason) return;
    setTimeoffAdding(true);
    try {
      const res = await fetch("/api/m/timeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(timeoffForm),
      });
      if (!res.ok) {
        const j = await res.json();
        setLoadError(j.error ?? "Failed to submit request");
        return;
      }
      const { request } = await res.json();
      setTimeoffs((t) => [request, ...t]);
      setTimeoffForm({ starts_on: "", ends_on: "", reason: "" });
      setTimeoffOpen(false);
    } finally {
      setTimeoffAdding(false);
    }
  }

  // ── Time-off: cancel ──────────────────────────────────────────────────────
  async function handleCancelTimeoff(id: string) {
    setTimeoffs((t) =>
      t.map((x) => (x.id === id ? { ...x, status: "cancelled" as const } : x))
    ); // optimistic
    const res = await fetch(`/api/m/timeoff/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setLoadError("Failed to cancel request");
      await loadAll();
    }
  }

  // ── Weekly grid summary ────────────────────────────────────────────────────
  const todayWd = getTodayWeekday();
  const activeWeekdays = new Set(slots.map((s) => s.weekday));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Schedule" />

      {loadError && (
        <div className="mx-4 mt-3 rounded-card bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {loadError}
        </div>
      )}

      {/* ── 1. This week ──────────────────────────────────────────────── */}
      <SectionTitle
        title="This week"
        action={
          <Link
            href="/m/profile/availability"
            className="text-[13px] font-semibold text-primary"
          >
            Edit
          </Link>
        }
      />
      <div className="mx-4 rounded-card bg-white p-4 shadow-card">
        <div className="grid grid-cols-7 gap-1">
          {[0, 1, 2, 3, 4, 5, 6].map((wd) => {
            const isToday = wd === todayWd;
            const isActive = activeWeekdays.has(wd);
            const daySlots = slots.filter((s) => s.weekday === wd);
            return (
              <div key={wd} className="flex flex-col items-center gap-1">
                <span
                  className={`text-[11px] font-semibold ${
                    isToday ? "text-primary" : "text-subheading"
                  }`}
                >
                  {WEEKDAY_SHORT[wd]}
                </span>
                <div
                  className={`h-8 w-8 rounded-full grid place-items-center text-[11px] font-bold transition ${
                    isToday
                      ? "bg-primary text-white"
                      : isActive
                      ? "bg-primary-50 text-primary"
                      : "bg-muted text-subheading"
                  }`}
                >
                  {isActive ? daySlots.length : "–"}
                </div>
                {isActive && daySlots.length > 0 && (
                  <span className="text-[9px] text-subheading leading-tight text-center">
                    {to12h(daySlots[0].start_time).replace(/ /g, "")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-subheading">
          Numbers show slot count per day.{" "}
          <Link href="/m/profile/availability" className="text-primary font-semibold underline">
            Edit availability →
          </Link>
        </p>
      </div>

      {/* ── 2. Block-out dates ────────────────────────────────────────── */}
      <SectionTitle
        title="Block-out dates"
        action={
          <button
            onClick={() => setBlockoutOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-3 py-1.5 text-[12.5px] font-semibold text-primary"
          >
            <IconPlus /> Add
          </button>
        }
      />

      {blockoutOpen && (
        <div className="mx-4 mb-3 rounded-card bg-white p-4 shadow-card">
          <p className="mb-3 text-[14px] font-semibold text-heading">Add block-out period</p>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[12px] text-subheading">From</label>
                <input
                  type="date"
                  value={blockoutForm.starts_on}
                  onChange={(e) =>
                    setBlockoutForm((f) => ({ ...f, starts_on: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-2xl bg-muted px-3 py-2 text-[13.5px] text-heading focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[12px] text-subheading">To</label>
                <input
                  type="date"
                  value={blockoutForm.ends_on}
                  onChange={(e) =>
                    setBlockoutForm((f) => ({ ...f, ends_on: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-2xl bg-muted px-3 py-2 text-[13.5px] text-heading focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] text-subheading">Reason (optional)</label>
              <input
                type="text"
                placeholder="e.g. Holiday, family event"
                value={blockoutForm.reason}
                onChange={(e) =>
                  setBlockoutForm((f) => ({ ...f, reason: e.target.value }))
                }
                className="mt-1 block w-full rounded-2xl bg-muted px-3 py-2 text-[13.5px] text-heading focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBlockoutOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddBlockout}
                disabled={
                  blockoutAdding ||
                  !blockoutForm.starts_on ||
                  !blockoutForm.ends_on
                }
              >
                {blockoutAdding ? "Adding…" : "Add block-out"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {blockouts.length === 0 ? (
        <p className="px-4 text-[13px] text-subheading">No upcoming block-out dates.</p>
      ) : (
        <ul className="mx-4 flex flex-col gap-2">
          {blockouts.map((b) => (
            <li
              key={b.id}
              className="flex items-start justify-between rounded-card bg-white p-4 shadow-card"
            >
              <div>
                <p className="text-[14px] font-semibold text-heading">
                  {fmtDateShort(b.starts_on)}
                  {b.starts_on !== b.ends_on ? ` – ${fmtDateShort(b.ends_on)}` : ""}
                </p>
                {b.reason && (
                  <p className="mt-0.5 text-[12px] text-subheading">{b.reason}</p>
                )}
              </div>
              <button
                onClick={() => handleDeleteBlockout(b.id)}
                className="ml-3 grid h-8 w-8 flex-none place-items-center rounded-full bg-muted text-subheading"
                aria-label="Delete block-out"
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── 3. Recurring clients ──────────────────────────────────────── */}
      <SectionTitle title="Recurring clients" />
      {clients.length === 0 ? (
        <p className="px-4 text-[13px] text-subheading">
          No upcoming recurring clients yet.
        </p>
      ) : (
        <ul className="mx-4 flex flex-col gap-3">
          {clients.map((c) => (
            <li key={c.client_id} className="rounded-card bg-white p-4 shadow-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary-50 text-primary">
                  <IconUser />
                </div>
                <div>
                  <p className="text-[14px] font-bold text-heading">
                    {c.display_name ?? "Client"}
                  </p>
                  <p className="text-[12px] text-subheading capitalize">
                    {c.client_type === "org" ? "Organisation" : "Private"} ·{" "}
                    {c.visit_count} upcoming visit{c.visit_count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5">
                {c.next_4_visits.map((v, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-muted">
                      <IconCal />
                    </span>
                    <span className="text-[12.5px] text-subheading">{fmtVisit(v)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {/* ── 4. Time off ───────────────────────────────────────────────── */}
      <SectionTitle
        title="Time off"
        action={
          <button
            onClick={() => setTimeoffOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-pill bg-primary-50 px-3 py-1.5 text-[12.5px] font-semibold text-primary"
          >
            <IconPlus /> Request
          </button>
        }
      />

      {timeoffOpen && (
        <div className="mx-4 mb-3 rounded-card bg-white p-4 shadow-card">
          <p className="mb-3 text-[14px] font-semibold text-heading">Request time off</p>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[12px] text-subheading">From</label>
                <input
                  type="date"
                  value={timeoffForm.starts_on}
                  onChange={(e) =>
                    setTimeoffForm((f) => ({ ...f, starts_on: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-2xl bg-muted px-3 py-2 text-[13.5px] text-heading focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="text-[12px] text-subheading">To</label>
                <input
                  type="date"
                  value={timeoffForm.ends_on}
                  onChange={(e) =>
                    setTimeoffForm((f) => ({ ...f, ends_on: e.target.value }))
                  }
                  className="mt-1 block w-full rounded-2xl bg-muted px-3 py-2 text-[13.5px] text-heading focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[12px] text-subheading">Reason *</label>
              <textarea
                placeholder="e.g. Medical appointment, family holiday"
                value={timeoffForm.reason}
                onChange={(e) =>
                  setTimeoffForm((f) => ({ ...f, reason: e.target.value }))
                }
                rows={3}
                className="mt-1 block w-full rounded-2xl bg-muted px-3 py-2 text-[13.5px] text-heading focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTimeoffOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddTimeoff}
                disabled={
                  timeoffAdding ||
                  !timeoffForm.starts_on ||
                  !timeoffForm.ends_on ||
                  !timeoffForm.reason
                }
              >
                {timeoffAdding ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {timeoffs.length === 0 ? (
        <p className="px-4 mb-6 text-[13px] text-subheading">No time-off requests yet.</p>
      ) : (
        <ul className="mx-4 mb-6 flex flex-col gap-2">
          {timeoffs.map((t) => (
            <li
              key={t.id}
              className="rounded-card bg-white p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold text-heading">
                      {fmtDate(t.starts_on)}
                      {t.starts_on !== t.ends_on ? ` – ${fmtDate(t.ends_on)}` : ""}
                    </p>
                    <span
                      className={`rounded-pill border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-subheading">{t.reason}</p>
                  {t.review_note && (
                    <p className="mt-1 text-[12px] italic text-subheading">
                      Note: {t.review_note}
                    </p>
                  )}
                </div>
                {t.status === "pending" && (
                  <button
                    onClick={() => handleCancelTimeoff(t.id)}
                    className="ml-2 rounded-pill border border-line px-3 py-1 text-[11.5px] font-semibold text-subheading"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <BottomNav active="bookings" role="carer" />
    </div>
  );
}

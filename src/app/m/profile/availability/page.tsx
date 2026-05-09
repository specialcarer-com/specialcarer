"use client";

import { useEffect, useState, useCallback } from "react";
import { TopBar, Toggle, Button, IconPlus, IconTrash } from "../../_components/ui";

// UI display order — Mon first, Sun last
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
type Day = (typeof DAYS)[number];

// Map display-order index (0=Mon) to DB weekday (0=Sun..6=Sat)
const DAY_TO_WEEKDAY: Record<Day, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 0,
};

type TimeSlot = { start: string; end: string }; // 24h "HH:MM"
type DayState = { active: boolean; slots: TimeSlot[] };

// ── Time helpers ─────────────────────────────────────────────────────────────

/** "14:30" → "2:30 PM" */
function to12h(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "14:30:00" or "14:30" → "14:30" */
function normTime(t: string): string {
  return t.slice(0, 5);
}

// ── Initial state (all inactive / empty) ─────────────────────────────────────
function emptyState(): Record<Day, DayState> {
  const init = {} as Record<Day, DayState>;
  for (const d of DAYS) init[d] = { active: false, slots: [] };
  return init;
}

export default function AvailabilityPage() {
  const [state, setState] = useState<Record<Day, DayState>>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Day | null>(null);
  const [savedDay, setSavedDay] = useState<Day | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [allSaving, setAllSaving] = useState(false);

  // ── Load slots from backend ───────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/m/availability");
      if (!res.ok) throw new Error(await res.text());
      const { slots } = await res.json();
      const next = emptyState();
      for (const slot of slots as { weekday: number; start_time: string; end_time: string }[]) {
        const day = DAYS.find((d) => DAY_TO_WEEKDAY[d] === slot.weekday);
        if (!day) continue;
        next[day].active = true;
        next[day].slots.push({
          start: normTime(slot.start_time),
          end: normTime(slot.end_time),
        });
      }
      setState(next);
    } catch (e) {
      setErrorMsg("Failed to load availability");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // ── Save a single day ─────────────────────────────────────────────────────
  async function saveDay(day: Day, dayState: DayState) {
    setSaving(day);
    setErrorMsg(null);
    const weekday = DAY_TO_WEEKDAY[day];
    // Optimistic: already updated in state
    const slots = dayState.active
      ? dayState.slots
          .filter((s) => s.start && s.end && s.end > s.start)
          .map((s) => ({ start_time: s.start + ":00", end_time: s.end + ":00" }))
      : [];
    try {
      const res = await fetch("/api/m/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday, slots }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Save failed");
      }
      setSavedDay(day);
      setTimeout(() => setSavedDay(null), 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setErrorMsg(msg);
      // Revert optimistic — reload from server
      await loadSlots();
    } finally {
      setSaving(null);
    }
  }

  // ── Save all ──────────────────────────────────────────────────────────────
  async function saveAll() {
    setAllSaving(true);
    setErrorMsg(null);
    try {
      await Promise.all(DAYS.map((d) => saveDay(d, state[d])));
    } finally {
      setAllSaving(false);
    }
  }

  // ── State mutations ───────────────────────────────────────────────────────
  function toggleDay(d: Day, active: boolean) {
    setState((s) => ({ ...s, [d]: { ...s[d], active } }));
  }

  function addSlot(d: Day) {
    setState((s) => ({
      ...s,
      [d]: { ...s[d], slots: [...s[d].slots, { start: "09:00", end: "12:00" }] },
    }));
  }

  function updateSlotField(d: Day, i: number, field: "start" | "end", v: string) {
    setState((s) => {
      const next = [...s[d].slots];
      next[i] = { ...next[i], [field]: v };
      return { ...s, [d]: { ...s[d], slots: next } };
    });
  }

  function removeSlot(d: Day, i: number) {
    setState((s) => ({
      ...s,
      [d]: { ...s[d], slots: s[d].slots.filter((_, idx) => idx !== i) },
    }));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Availability" back="/m/profile" />

      {loading && (
        <div className="flex justify-center pt-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && (
        <>
          {errorMsg && (
            <div className="mx-5 mt-3 rounded-card bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {errorMsg}
            </div>
          )}

          <ul className="mt-2 flex flex-col gap-3 px-5">
            {DAYS.map((d) => {
              const s = state[d];
              const isSaving = saving === d;
              const isSaved = savedDay === d;
              return (
                <li key={d} className="rounded-card bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] font-bold text-heading">{d}</p>
                    <div className="flex items-center gap-3">
                      {isSaved && (
                        <span className="text-[12px] font-semibold text-primary">Saved</span>
                      )}
                      {isSaving && (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      )}
                      <Toggle checked={s.active} onChange={(v) => toggleDay(d, v)} />
                    </div>
                  </div>

                  {s.active && (
                    <div className="mt-3 flex flex-col gap-2">
                      {s.slots.map((slot, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2"
                        >
                          {/* 24h time inputs internally */}
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => updateSlotField(d, i, "start", e.target.value)}
                            className="bg-transparent text-[13.5px] text-heading focus:outline-none"
                            aria-label="Start time"
                          />
                          <span className="text-[13px] text-subheading">—</span>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => updateSlotField(d, i, "end", e.target.value)}
                            className="bg-transparent text-[13.5px] text-heading focus:outline-none"
                            aria-label="End time"
                          />
                          {/* Display label */}
                          <span className="flex-1 text-right text-[12px] text-subheading">
                            {slot.start && slot.end
                              ? `${to12h(slot.start)} – ${to12h(slot.end)}`
                              : ""}
                          </span>
                          <button
                            onClick={() => removeSlot(d, i)}
                            className="grid h-7 w-7 place-items-center rounded-full bg-white text-subheading"
                            aria-label="Remove slot"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => addSlot(d)}
                          className="inline-flex items-center gap-1 self-start rounded-pill bg-primary-50 px-3 py-1.5 text-[12.5px] font-semibold text-primary"
                        >
                          <IconPlus /> Add time
                        </button>
                        <button
                          onClick={() => saveDay(d, state[d])}
                          disabled={isSaving}
                          className="ml-auto inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1.5 text-[12.5px] font-semibold text-subheading disabled:opacity-50"
                        >
                          Save day
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={saveAll} disabled={loading || allSaving}>
          {allSaving ? "Saving…" : "Save all"}
        </Button>
      </div>
    </div>
  );
}
